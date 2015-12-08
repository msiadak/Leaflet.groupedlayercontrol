/* global L */

var _ = {
  set: require('lodash.set'),
  get: require('lodash.get'),
  slice: require('lodash.slice'),
  has: require('lodash.has'),
  last: require('lodash.last')
}

L.Control.GroupedLayers = L.Control.extend({

  options: {
    collapsed: true,
    position: 'topright',
    autoZIndex: true,
    exclusiveGroups: [],
    groupCheckboxes: false
  },

  initialize: function (baseLayers, groupedOverlays, options) {
    var i, j;
    L.Util.setOptions(this, options);

    this._layers = {};
    this._lastZIndex = 0;
    this._handlingClick = false;
    this._groupList = [];
    this._domGroups = [];

    for (i in baseLayers) {
      this._addLayer(baseLayers[i], i);
    }

    for (i in groupedOverlays) {
      for (var j in groupedOverlays[i]) {
        this._addLayer(groupedOverlays[i][j], j, i, true);
      }
    }
  },

  onAdd: function (map) {
    this._initLayout();
    this._update();

    map
        .on('zoomend', this._checkDisabledLayers, this);

    return this._container;
  },

  onRemove: function (map) {
    map
        .off('zoomend', this._checkDisabledLayers, this);
  },

  addBaseLayer: function (layer, name) {
    this._addLayer(layer, name);
    return this._update();
  },

  addOverlay: function (layer, name, group) {
    this._addLayer(layer, name, group, true);
    this._update();
    return this;
  },

  removeLayer: function (layer) {
    layer.off('add remove', this._onLayerChange, this);

    delete this._layers[L.stamp(layer)];
    return this._update();
  },

  _initLayout: function () {
    var className = 'leaflet-control-layers',
        container = this._container = L.DomUtil.create('div', className);

    //Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
    container.setAttribute('aria-haspopup', true);

    if (!L.Browser.touch) {
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(container, 'wheel', L.DomEvent.stopPropagation);
    } else {
      L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation);
    }

    var form = this._form = L.DomUtil.create('form', className + '-list');

    if (this.options.collapsed) {
      if (!L.Browser.android) {
        L.DomEvent
            .on(container, 'mouseover', this._expand, this)
            .on(container, 'mouseout', this._collapse, this);
      }
      var link = this._layersLink = L.DomUtil.create('a', className + '-toggle', container);
      link.href = '#';
      link.title = 'Layers';

      if (L.Browser.touch) {
        L.DomEvent
            .on(link, 'click', L.DomEvent.stop)
            .on(link, 'click', this._expand, this);
      }
      else {
        L.DomEvent.on(link, 'focus', this._expand, this);
      }

      this._map.on('click', this._collapse, this);
      // TODO keyboard accessibility
    } else {
      this._expand();
    }

    this._baseLayersList = L.DomUtil.create('div', className + '-base', form);
    this._separator = L.DomUtil.create('div', className + '-separator', form);
    this._overlaysList = L.DomUtil.create('div', className + '-overlays', form);

    container.appendChild(form);
  },

  _addLayer: function (layer, name, group, overlay) {
    layer.on('add remove', this._onLayerChange, this);
    var id = L.stamp(layer);

    this._layers[id] = {
      layer: layer,
      name: name,
      overlay: overlay
    };

    group = group || '';
    var groupId = this._indexOf(this._groupList, group);

    if (groupId === -1) {
      groupId = this._groupList.push(group) - 1;
    }

    var exclusive = (this._indexOf(this.options.exclusiveGroups, group) != -1);

    this._layers[id].group = {
      name: group,
      id: groupId,
      exclusive: exclusive
    };

    if (this.options.autoZIndex && layer.setZIndex) {
      this._lastZIndex++;
      layer.setZIndex(this._lastZIndex);
    }
  },

  _update: function () {
    if (!this._container) {
      return;
    }

    this._baseLayersList.innerHTML = '';
    this._overlaysList.innerHTML = '';
    this._domGroups.length = 0;

    var baseLayersPresent = false,
        overlaysPresent = false,
        i, obj;

    for (i in this._layers) {
      obj = this._layers[i];
      this._addItem(obj);
      overlaysPresent = overlaysPresent || obj.overlay;
      baseLayersPresent = baseLayersPresent || !obj.overlay;
    }

    this._separator.style.display = overlaysPresent && baseLayersPresent ? '' : 'none';
  },

  _onLayerChange: function (e) {
    if (!this._handlingClick) {
      this._update();
    }
    var obj = this._layers[L.stamp(e.target)];

    var type = obj.overlay ?
      (e.type === 'layeradd' ? 'overlayadd' : 'overlayremove') :
      (e.type === 'layeradd' ? 'baselayerchange' : null);

    if (type) {
      this._map.fire(type, obj);
    }
  },

  // IE7 bugs out if you create a radio dynamically, so you have to do it this hacky way (see http://bit.ly/PqYLBe)
  _createRadioElement: function (name, checked) {

    var radioHtml = '<input type="radio" class="leaflet-control-layers-selector" name="' + name + '"';
    if (checked) {
      radioHtml += ' checked="checked"';
    }
    radioHtml += '/>';

    var radioFragment = document.createElement('div');
    radioFragment.innerHTML = radioHtml;

    return radioFragment.firstChild;
  },

  _addItem: function (obj) {
    var label = document.createElement('label'),
        input,
        checked = this._map.hasLayer(obj.layer),
        container,
        layerId = L.stamp(obj.layer);

    if (obj.overlay) {
      if (obj.group.exclusive) {
        groupRadioName = 'leaflet-exclusive-group-layer-' + obj.group.id;
        input = this._createRadioElement(groupRadioName, checked);
      } else {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'leaflet-control-layers-selector';
        input.defaultChecked = checked;
      }
    } else {
      input = this._createRadioElement('leaflet-base-layers', checked);
    }

    input.layerId = layerId;
    input.groupID = obj.group.id;
    L.DomEvent.on(input, 'click', this._onInputClick, this);

    var name = document.createElement('span');
    name.innerHTML = ' ' + obj.name;

    label.appendChild(input);
    label.appendChild(name);

    if (_.has(obj.layer.options, 'filter')) {
      var filter = obj.layer.options.filter,
          values = filter.values,
          select = document.createElement('select'),
          filterSpan = document.createElement('span');
          filterIcon = document.createElement('i'),
          cancelIcon = document.createElement('i'),
          selectSpan = document.createElement('span');
      
      filterIcon.className = 'icon ion-funnel leaflet-control-layers-filter-icon';
      cancelIcon.className = 'icon ion-android-cancel leaflet-control-layers-filter-cancel';
      select.className = 'leaflet-control-layers-filter-select';
      select.layerId = layerId;
      filterSpan.className = 'leaflet-control-layers-filter-container';
      selectSpan.className = 'leaflet-control-layers-filter-select-container-hidden';
      
      if (values.indexOf('') === -1) {
        values.unshift('');
      }
      for (var i=0; i < values.length; i++) {
        var option = document.createElement('option');
        option.value = option.innerHTML = values[i];
        if (option.value === '') {
          option.selected = true;
          option.className = 'leaflet-control-layers-filter-option-null';
          if (filter.nullPrompt) {
            option.innerHTML = filter.nullPrompt;
          }
        }
        select.appendChild(option);
      }
      
      selectSpan.appendChild(select);
      selectSpan.appendChild(cancelIcon);
      filterSpan.appendChild(filterIcon);
      filterSpan.appendChild(selectSpan);

      L.DomEvent.on(select, 'change', this._onFilterChange, this);
      L.DomEvent.on(filterIcon, 'click', this._onFilterIconClick, this);
      L.DomEvent.on(cancelIcon, 'click', this._onFilterCancelIconClick, this);
    }

    if (obj.overlay) {
      container = this._overlaysList;

      var groupContainer = this._domGroups[obj.group.id];

      // Create the group container if it doesn't exist
      if (!groupContainer) {
        groupContainer = document.createElement('div');
        groupContainer.className = 'leaflet-control-layers-group';
        groupContainer.id = 'leaflet-control-layers-group-' + obj.group.id;

        var groupLabel = document.createElement('label');
        groupLabel.className = 'leaflet-control-layers-group-label';
        
        if ("" != obj.group.name && !obj.group.exclusive){
          // ------ add a group checkbox with an _onInputClickGroup function
          if (this.options.groupCheckboxes) {
            var groupInput = document.createElement('input');
            groupInput.type = 'checkbox';
            groupInput.className = 'leaflet-control-layers-group-selector';
            groupInput.groupID = obj.group.id;
            groupInput.legend = this;
            L.DomEvent.on(groupInput, 'click', this._onGroupInputClick, groupInput);
            groupLabel.appendChild(groupInput);
          };
        };

        var groupName = document.createElement('span');
        groupName.className = 'leaflet-control-layers-group-name';
        groupName.innerHTML = obj.group.name;
        groupLabel.appendChild(groupName);

        groupContainer.appendChild(groupLabel);
        container.appendChild(groupContainer);

        this._domGroups[obj.group.id] = groupContainer;
      }

      container = groupContainer;
    } else {
      container = this._baseLayersList;
    }

    container.appendChild(label);
    if (filterSpan) {
      label.appendChild(filterSpan);
    }
    
    this._checkDisabledLayers();
    return label;
  },
  
  _onFilterIconClick: function (e) {
    var icon = e.target,
        span = filterIcon.nextSibling,
        select = span.querySelector('select'),
        layer = this._layers[select.layerId].layer,
        filter = layer.options.filter;
    span.className = 'leaflet-control-layers-filter-select-container';
    icon.className = 'leaflet-control-layers-filter-icon-hidden';

    this._onFilterChange(e);
    L.DomEvent.stopPropagation(e);
  },

  _onFilterCancelIconClick: function (e) {
    var cancelIcon = e.target,
        span = cancelIcon.parentNode,
        icon = span.previousSibling,
        select = span.querySelector('select'),
        layer = this._layers[select.layerId].layer;
    
    icon.className = 'leaflet-control-layers-filter-icon icon ion-funnel';
    span.className = 'leaflet-control-layers-filter-select-container-hidden';
    
    this._cancelFilter(layer);
    L.DomEvent.stopPropagation(e);
  },
  
  _onFilterChange: function (e) {
    var selects = this._form.getElementsByTagName('select');

    for (var i=0; i < selects.length; i++) {
      var select = selects[i];
      if (select.className === 'leaflet-control-layers-filter-select') {
        var layer = this._layers[select.layerId].layer,
            filter = layer.options.filter,
            selectedOption = select.options[select.selectedIndex],
            selectedValue = selectedOption.value; 
        if (selectedValue === '') {
          filter.selected = null;
          this._cancelFilter(layer);
        } 
        else if (filter.selected !== selectedValue || !_.has(filter, 'selected')) {
          filter.selected = selectedValue;
          this._applyFilter(layer);
        } else {
          this._applyFilter(layer);
        }
        if (_.has(selectedOption, 'classname')) {
          L.DomUtil.addClass(selectedOption.className);
        }
      }
    }

    L.DomEvent.stopPropagation(e);
  },

  _applyFilter: function(layer) {
    var filter = layer.options.filter,
        targetProperty = filter.targetProperty,
        template = filter.template,
        values = filter.values,
        selected = filter.selected;

    _.set(layer, targetProperty, template.replace('{0}', selected));
    filter._applied = true;
    layer.redraw();
  },

  _cancelFilter: function(layer) {
    var filter = layer.options.filter;
        targetProperty = filter.targetProperty;

    this._deleteNestedProperty(layer, targetProperty);
    filter._applied = false;
    layer.redraw();
  },

  _onGroupInputClick: function () {
    var i, input, obj;
    
    this_legend = this.legend;
    this_legend._handlingClick = true;

    var inputs = this_legend._form.getElementsByTagName('input');
    var inputsLen = inputs.length;
    for (i = 0; i < inputsLen; i++) {
      input = inputs[i];
      if ( input.groupID == this.groupID && input.className == 'leaflet-control-layers-selector') {
          input.checked = this.checked;
          obj = this_legend._layers[input.layerId];
          if (input.checked && !this_legend._map.hasLayer(obj.layer)) {
              this_legend._map.addLayer(obj.layer);
          } else if (!input.checked && this_legend._map.hasLayer(obj.layer)) {
              this_legend._map.removeLayer(obj.layer);
          };
      };
    };
    this_legend._handlingClick = false;
  },
  
  _onInputClick: function () {
    var i, input, obj,
        inputs = this._form.getElementsByTagName('input'),
        inputsLen = inputs.length;

    this._handlingClick = true;

    for (i = 0; i < inputsLen; i++) {
      input = inputs[i];
      if (input.className == 'leaflet-control-layers-selector') {
        obj = this._layers[input.layerId];

        if (input.checked && !this._map.hasLayer(obj.layer)) {
          this._map.addLayer(obj.layer);

        } else if (!input.checked && this._map.hasLayer(obj.layer)) {
          this._map.removeLayer(obj.layer);
        }
      }
    }

    this._handlingClick = false;
  },


  _expand: function () {
    L.DomUtil.addClass(this._container, 'leaflet-control-layers-expanded');
  },

  _collapse: function () {
    this._container.className = this._container.className.replace(' leaflet-control-layers-expanded', '');
  },

  _indexOf: function (arr, obj) {
    for (var i = 0, j = arr.length; i < j; i++) {
      if (arr[i] === obj) {
        return i;
      }
    }
    return -1;
  },

  _checkDisabledLayers: function () {
    var inputs = this._form.getElementsByTagName('input'),
        input,
        layer,
        zoom = this._map.getZoom();
   
    for (var i = inputs.length - 1; i >= 0; i--) {
      input = inputs[i];
      layer = this._layers[input.layerId].layer;
      if (_.has(layer, 'options')) {
        input.disabled = (layer.options.minZoom !== undefined && zoom < layer.options.minZoom) ||
                         (layer.options.maxZoom !== undefined && zoom > layer.options.maxZoom);
      }
    }
  },

  _deleteNestedProperty: function(object, path) {
    path = path.split('.');
    object = path.length == 1 ? object : _.get(object, _.slice(path, 0, -1));
    var key = _.last(path);
    return (object != null && _.has(object, key)) ? delete object[key] : true;
  },

});

L.control.groupedLayers = function (baseLayers, groupedOverlays, options) {
  return new L.Control.GroupedLayers(baseLayers, groupedOverlays, options);
};

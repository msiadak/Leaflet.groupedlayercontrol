module.exports = function(grunt) {
  var banner = '/*! Version: <%= pkg.version %>\nDate: <%= grunt.template.today("yyyy-mm-dd") %> */\n';

  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    eslint: {
      target: 'src/*.js'
    },
    browserify: {
      build: {
        src: 'src/*.js',
        dest: 'build/leaflet.groupedlayercontrol.bundle.js',
      }
    },
    uglify: {
      options: {
        banner: banner,
        preserveComments: 'some',
        sourceMap: true
      },
      dist: {
        files: {
          'dist/leaflet.groupedlayercontrol.min.js': 'build/leaflet.groupedlayercontrol.bundle.js'
        }
      }
    },
    cssmin: {
      dist: {
        files: {
          'dist/leaflet.groupedlayercontrol.min.css': 'src/leaflet.groupedlayercontrol.css'
        }
      }
    },
    bump: {
      options: {
        files: ['bower.json', 'package.json'],
        commitFiles: ['bower.json', 'commit.json'],
        push: false
      }
    }
  });

  grunt.registerTask('default', ['browserify', 'uglify', 'cssmin']);
};

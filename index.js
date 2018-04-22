'use strict';

var interactionEvents = require('normalized-interaction-events');
var transformMat4 = require('gl-vec3/transformMat4');
var vec3RotateY = require('gl-vec3/rotateY');
var vec3RotateX = require('gl-vec3/rotateX');
var vec3Equals = require('gl-vec3/equals');
var vec3Add = require('gl-vec3/add');
var vec3ScaleAndAdd = require('gl-vec3/scaleAndAdd');
var vec3Copy = require('gl-vec3/copy');
var vec3Normalize = require('gl-vec3/normalize');
var mat4Identity = require('gl-mat4/identity');
var mat4Invert = require('gl-mat4/invert');
var mat4Translate = require('gl-mat4/translate');
var mat4Scale = require('gl-mat4/scale');
var lookAt = require('gl-mat4/lookAt');
var perspective = require('gl-mat4/perspective');

module.exports = function Camera (regl, opts) {
  opts = opts || {};
  var element = opts.element || regl._gl.canvas;
  var viewUniformName = opts.viewUniformName || "view";
  var projectionUniformName = opts.viewUniformName || "projection";
  var eyeUniformName = opts.eyeUniformName || "eye";

  var state = {
    dirty: true,
    zoomAboutCursor: opts.zoomAboutCursor === undefined ? true : opts.zoomAboutCursor,
    rotateAboutCenter: opts.rotateAboutCenter === undefined ? false : opts.rotateAboutCenter,

    enableZoom: opts.enableZoom === undefined ? true : opts.enableZoom,
    enablePivot: opts.enablePivot === undefined ? true : opts.enablePivot,
    enablePan: opts.enablePan === undefined ? true : opts.enablePan,
    enableRotation: opts.enableRotation === undefined ? true : opts.enableRotation,

    distance: opts.distance === undefined ? 10 : opts.distance,
    phi: opts.phi === undefined ? 0 : opts.phi,
    theta: opts.theta === undefined ? 0 : opts.theta,
    fovY: opts.fovY === undefined ? Math.PI / 4 : opts.fovY,
    near: opts.near === undefined ? 0.1 : opts.near,
    far: opts.far === undefined ? 100 : opts.far,

    wheelSpeed: opts.wheelSpeed === undefined ? 1.0 : opts.wheelSpeed,
    rotationSpeed: opts.rotationSpeed || 1.0,

    panDecayTime: opts.panDecayTime || 100,
    zoomDecayTime: opts.zoomDecayTime || 100,
    rotationDecayTime: opts.rotationDecayTime || 100,

    up: opts.up || new Float32Array([0, 1, 0]),
    center: opts.center || new Float32Array(3),

    zoom: 0,
    panX: 0,
    panY: 0,
    panZ: 0,
		pitch: 0,
		yaw: 0,
    dTheta: 0,
    dPhi: 0,
    x0: 0,
    y0: 0,
  };

  camera.projection = new Float32Array(16);
  camera.projectionInv = new Float32Array(16);
  camera.viewInv = new Float32Array(16);
  camera.view = new Float32Array(16);
  camera.width = null;
  camera.height = null;
  camera.aspectRatio = null;
  camera.eye = new Float32Array(3);

  var origin = new Float32Array(3);
  var dView = new Float32Array(16);

  state.rotationCenter = opts.rotationCenter || new Float32Array(opts.rotationCenter || state.center);

  var previousState = {
    distance: opts.distance === undefined ? 35 : opts.distance,
    phi: opts.phi === undefined ? 0 : opts.phi,
    theta: opts.theta === undefined ? 0 : opts.theta,
    fovY: opts.fovY === undefined ? Math.PI / 4 : opts.fovY,
    near: opts.near === undefined ? 0.1 : opts.near,
    far: opts.far === undefined ? 500 : opts.far,
    up: opts.up || new Float32Array([0, 1, 0]),
    center: opts.center || new Float32Array(3),
  };

  function getSize () {
    var w = camera.width = element === window ? element.innerWidth : element.clientWidth;
    var h = camera.height = element === window ? element.innerHeight : element.clientHeight;
    camera.aspectRatio = w / h;
  }

  function storeCurrentState () {
    vec3Copy(previousState.up, state.up);
    vec3Copy(previousState.center, state.center);
    previousState.near = state.near;
    previousState.far = state.far;
    previousState.distance = state.distance;
    previousState.phi = state.phi;
    previousState.theta = state.theta;
    previousState.fovY = state.fovY;
  }

  function stateHasChanged () {
    if (!vec3Equals(state.up, previousState.up)) return true;
    if (!vec3Equals(state.center, previousState.center)) return true;
    if (state.near !== previousState.near) return true;
    if (state.far !== previousState.far) return true;
    if (state.phi !== previousState.phi) return true;
    if (state.theta !== previousState.theta) return true;
    if (state.distance !== previousState.distance) return true;
    if (state.fovY !== previousState.fovY) return true;
    return false;
  }

  var stateChanges = {};
  function applyStateChanges () {
    stateChanges.dPhi = state.phi - previousState.phi;
    stateChanges.dTheta = state.theta - previousState.theta;
    stateChanges.zoom = state.distance / previousState.distance - 1;
    state.theta = previousState.theta;
    state.distance = previousState.distance;
    state.phi = previousState.phi;
    stateChanges.yaw = 0;
    stateChanges.pitch = 0;
    stateChanges.panX = 0;
    stateChanges.panY = 0;
    stateChanges.panZ = 0;
    stateChanges.x0 = 0;
    stateChanges.y0 = 0;

    applyViewChanges(stateChanges);
  }

  function computeMatrices () {
    camera.eye[0] = 0;
    camera.eye[1] = 0;
    camera.eye[2] = state.distance;

    vec3RotateX(camera.eye, camera.eye, origin, -state.phi);
    vec3RotateY(camera.eye, camera.eye, origin, -state.theta);
    vec3Add(camera.eye, camera.eye, state.center);

    lookAt(camera.view, camera.eye, state.center, state.up);
    perspective(camera.projection, state.fovY, camera.aspectRatio, state.near, state.far);

    mat4Invert(camera.viewInv, camera.view);
    mat4Invert(camera.projectionInv, camera.projection);
  }

  function taint () {
    state.dirty = true;
  }

  function resize () {
    getSize();
    computeMatrices();
    taint();
  }

  function viewIsChanging () {
    if (Math.abs(state.zoom) > 1e-4) return true;
    if (Math.abs(state.panX) > 1e-4) return true;
    if (Math.abs(state.panY) > 1e-4) return true;
    if (Math.abs(state.panZ) > 1e-4) return true;
    if (Math.abs(state.dTheta) > 1e-4) return true;
    if (Math.abs(state.dPhi) > 1e-4) return true;
    if (Math.abs(state.yaw) > 1e-4) return true;
    if (Math.abs(state.pitch) > 1e-4) return true;
  }

  function haltViewChange () {
    state.zoom = 0;
    state.dTheta = 0;
    state.dPhi = 0;
    state.panX = 0;
    state.panY = 0;
    state.panZ = 0;
    state.yaw = 0;
    state.pitch = 0;
  }

  function decay (dt) {
    var panDecay = state.panDecayTime ? Math.exp(-dt / state.panDecayTime / Math.LN2) : 0;
    var zoomDecay = state.zoomDecayTime ? Math.exp(-dt / state.zoomDecayTime / Math.LN2) : 0;
    var rotateDecay = state.rotationDecayTime ? Math.exp(-dt / state.rotationDecayTime / Math.LN2) : 0;
    state.zoom *= zoomDecay;
    state.panX *= panDecay;
    state.panY *= panDecay;
    state.panZ *= panDecay;
    state.dTheta *= rotateDecay;
    state.dPhi *= rotateDecay;
    state.yaw *= rotateDecay;
    state.pitch *= rotateDecay;
  }

  var ie = interactionEvents(element)
    .on('wheel', function (ev) {
      if (state.enableZoom) {
        var scaleFactor = state.distance * Math.tan(state.fovY * 0.5);
        state.x0 = ((ev.x / camera.width) * 2.0 - 1.0) * camera.aspectRatio * scaleFactor;
        state.y0 = -((ev.y / camera.height) * 2.0 - 1.0) * scaleFactor;
        state.zoom = Math.exp(ev.dy * 0.002 * state.wheelSpeed) - 1.0;
        ev.originalEvent.preventDefault();
      }
    }).on('mousemove', function (ev) {
      if (ev.buttons !== 1) return;

      if (ev.mods.shift && state.enablePan) {
        var scaleFactor = state.distance * Math.tan(state.fovY * 0.5) / camera.height * 2.0;
        state.panX = -ev.dx * scaleFactor;
        state.panY = ev.dy * scaleFactor;
      } else if (ev.mods.meta && state.enablePivot) {
        var scaleFactor = state.fovY / camera.height;
        state.yaw = -ev.dx * scaleFactor;
        state.pitch = ev.dy * scaleFactor;
      } else if (state.enableRotation) {
        state.dTheta = ev.dx / 200 * state.rotationSpeed;
        state.dPhi = ev.dy / 200 * state.rotationSpeed;
      }
      ev.originalEvent.preventDefault();
    }).on('touchstart', function (ev) {
      if (state.enableRotation || state.enablePan || state.enableZoom) {
        ev.originalEvent.preventDefault();
      }
    }).on('touchend', function (ev) {
      if (state.enableRotation || state.enablePan || state.enableZoom) {
        ev.originalEvent.preventDefault();
      }
    }).on('pinchstart', function (ev) {
      if (state.enableRotation || state.enablePan || state.enableZoom) {
        ev.originalEvent.preventDefault();
      }
    }).on('pinchend', function (ev) {
      if (state.enableRotation || state.enablePan || state.enableZoom) {
        ev.originalEvent.preventDefault();
      }
    }).on('touchmove', function (ev) {
      if (state.enableRotation) {
        state.dTheta = ev.dx / 200 * state.rotationSpeed;
        state.dPhi = ev.dy / 200 * state.rotationSpeed;

        ev.originalEvent.preventDefault();
      }
    }).on('pinchmove', function (ev) {
      var scaleFactor = state.distance * Math.tan(state.fovY * 0.5);
      state.x0 = ((ev.x0 / camera.width) * 2.0 - 1.0) * camera.aspectRatio * scaleFactor;
      state.y0 = -((ev.y0 / camera.height) * 2.0 - 1.0) * scaleFactor;
      if (state.enableZoom) {
        state.zoom = 1 - 0.5 * (ev.dzoomx + ev.dzoomy); 
      }

      if (state.enablePan) {
        state.panX = -ev.dx * scaleFactor / camera.height * 2.0;
        state.panY = ev.dy * scaleFactor / camera.height * 2.0;
      }

      if (state.enableZoom || state.enablePan) {
        ev.originalEvent.preventDefault();
      }
    });

  function applyViewChanges (changes) {
    mat4Identity(dView);
    if (state.zoomAboutCursor) mat4Translate(dView, dView, [changes.x0, changes.y0, 0]);
    mat4Scale(dView, dView, [1 + changes.zoom, 1 + changes.zoom, 1]);
    if (state.zoomAboutCursor) mat4Translate(dView, dView, [-changes.x0, -changes.y0, 0]);
    dView[12] += changes.panX;
    dView[13] += changes.panY;

    transformMat4(state.center, state.center, camera.view);
    transformMat4(state.center, state.center, dView);
    transformMat4(state.center, state.center, camera.viewInv);

    if (state.rotateAboutCenter) {
      vec3Copy(state.rotationCenter, state.center);
    }

    vec3RotateY(state.center, state.center, state.rotationCenter, -changes.dTheta);

    state.distance *= 1 + changes.zoom;
    state.theta += changes.dTheta;

    var prevPhi = state.phi;
    state.phi += changes.dPhi;
    state.phi = Math.min(Math.PI * 0.5 - 1e-4, Math.max(-Math.PI * 0.5 + 1e-6, state.phi));
    var dPhi = state.phi - prevPhi;

    vec3RotateY(state.center, state.center, state.rotationCenter, state.theta);
    vec3RotateX(state.center, state.center, state.rotationCenter, -dPhi);
    vec3RotateY(state.center, state.center, state.rotationCenter, -state.theta);

    if (changes.yaw !== 0 || changes.pitch !== 0) {
      var right = [camera.view[0], camera.view[4], camera.view[8]];
      var up = [camera.view[1], camera.view[5], camera.view[9]];
      var forward = [camera.view[2], camera.view[6], camera.view[10]];
      vec3Normalize(right, right);
      vec3Normalize(up, up);
      vec3Normalize(forward, forward);
      vec3ScaleAndAdd(state.center, state.center, right, Math.sin(changes.yaw) * state.distance);
      vec3ScaleAndAdd(state.center, state.center, up, Math.sin(changes.pitch) * state.distance);
      vec3ScaleAndAdd(state.center, state.center, forward, (2 - Math.cos(changes.yaw) - Math.cos(changes.pitch)) * state.distance);
      state.phi -= changes.pitch;
      state.theta += changes.yaw;
    }
    
    computeMatrices();
    taint();
  }

  var uniforms = {};

  uniforms[viewUniformName] = regl.context('view');
  uniforms[projectionUniformName] = regl.context('projection');
  uniforms[eyeUniformName] = regl.context('eye');

  var setProps = regl({
    context: {
      view: camera.view,
      projection: camera.projection,
      eye: camera.eye,
    },
    uniforms: uniforms
  });

  var t0 = null;
  function camera (mergeState, cb) {
    if (!cb) {
      cb = mergeState || {};
    } else {
      Object.assign(state, mergeState);
    }

    var t = Date.now();
    if (stateHasChanged()) {
      applyStateChanges();
    }

    if (viewIsChanging()) {
      applyViewChanges(state);
    } else {
      haltViewChange();
    }

    if (t0 !== null) decay(t - t0);
    t0 = t;

    setProps(function () {
      cb(state);
    });

    storeCurrentState();

    state.dirty = false;
  }

  camera.taint = taint;
  camera.resize = resize;
  camera.state = state;

  resize();

  return camera;
}

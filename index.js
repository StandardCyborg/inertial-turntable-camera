'use strict';

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

// This is a quick and dirty way of avoiding the poles.
var MAX_PHI = Math.PI * 0.5 - 1e-4;
var MIN_PHI = -Math.PI * 0.5 + 1e-4;

module.exports = function createCamera (opts) {
  opts = opts || {};

  // A proxy flag with which we track the dirty params so that it doesn't need
  // an extra method to tell the camera that the scene *has been* rendered.
  var willBeDirty = true;

  var params = {
    aspectRatio: opts.aspectRatio ? opts.aspectRatio : 1,

    // Zoom about the cursor as opposed to the center of the scene
    zoomAboutCursor: opts.zoomAboutCursor === undefined ? true : opts.zoomAboutCursor,

    // Spherical coords!
    distance: opts.distance === undefined ? 10 : opts.distance,
    phi: opts.phi === undefined ? 0 : opts.phi,
    theta: opts.theta === undefined ? 0 : opts.theta,

    // Camera parameters
    fovY: opts.fovY === undefined ? Math.PI / 4 : opts.fovY,
    near: opts.near === undefined ? 0.1 : opts.near,
    far: opts.far === undefined ? 100 : opts.far,

    // Decay of inertia, in ms
    panDecayTime: opts.panDecayTime || 100,
    zoomDecayTime: opts.zoomDecayTime || 100,
    rotationDecayTime: opts.rotationDecayTime || 100,

    dirty: true,

    up: opts.up || new Float32Array([0, 1, 0]),
    center: opts.center || new Float32Array(3),
    rotationCenter: opts.rotationCenter || opts.center && opts.center.slice() || new Float32Array(3),

    // Current interactions, which can be set directly. If setting directly, changes
    // will be additive to changes resulting from interactions.
    zoom: 0,
    panX: 0,
    panY: 0,
    panZ: 0,
    pitch: 0,
    yaw: 0,
    dTheta: 0,
    dPhi: 0,

    // Mouse coordinates of the interaction. Note that we fudge things ever so slightly
    // here and only store one mouse position per frame, so that we might actually
    // apply multiple accumulated events per frame about the *slightly* incorrect point.
    // In reality, I think this fudgeable.
    mouseX: 0,
    mouseY: 0,
  };

  var t0 = null;
  const camera = {
    update: function (mergeState) {
      // If we've accumulated interactions, then set them in the params directly.
      // Alternatively, we could recompute the full params on every single interaction
      // event, but that would result in maybe twice as many full matrix/view updates
      // as could ever be rendered in browsers like Safari that dispatch multiple
      // events per requestAnimationFrame.
      if (accumulator.zoom) params.zoom = accumulator.zoom;
      if (accumulator.dTheta) params.dTheta = accumulator.dTheta;
      if (accumulator.dPhi) params.dPhi = accumulator.dPhi;
      if (accumulator.panX) params.panX = accumulator.panX;
      if (accumulator.panY) params.panY = accumulator.panY;
      if (accumulator.panZ) params.panZ = accumulator.panZ;
      if (accumulator.yaw) params.yaw = accumulator.yaw;
      if (accumulator.pitch) params.pitch = accumulator.pitch;
      zeroChanges(accumulator);

      if (mergeState) {
        // Okay, so if we just merge changes, that totally breaks mouse interaction
        // because provided dPhi will zero out dPhi resulting from mouse interaction.
        // It would be better to accumulate mouse pixel changes separately and then
        // add this in afterwards, but since we've accumulated dPhi etc right in the
        // params, we need to cache this, then merge changes, then add these back in
        // if necessary. Consider this a low-priority cleanup item.
        var cachedDPhi = params.dPhi;
        var cachedDTheta = params.dTheta;
        var cachedZoom = params.zoom;
        var cachedPanX = params.panX;
        var cachedPanY = params.panY;
        var cachedPanZ = params.panZ;
        var cachedPitch = params.pitch;
        var cachedYaw = params.yaw;

        // This merges anything and everything in the params vector.
        Object.assign(params, mergeState);

        // Yup, so add them back in.
        if (mergeState.dPhi !== undefined) params.dPhi += cachedDPhi;
        if (mergeState.dTheta !== undefined) params.dTheta += cachedDTheta;
        if (mergeState.zoom !== undefined) params.zoom += cachedZoom;
        if (mergeState.panX !== undefined) params.panX += cachedPanX;
        if (mergeState.panY !== undefined) params.panY += cachedPanY;
        if (mergeState.panZ !== undefined) params.panZ += cachedPanZ;
        if (mergeState.pitch !== undefined) params.pitch += cachedPitch;
        if (mergeState.yaw !== undefined) params.yaw += cachedYaw;
      }

      // Check for and apply passive changes to the params vector. That is, if you
      // set camera.params.distance, this will automatically factor in those changes.
      if (paramsVectorHasChanged()) {
        applyStateChanges();
      }

      // Check if the view is changing above some threshold tolerance.
      if (viewIsChanging()) {
        // If so, update the view.
        applyViewChanges(params);
      } else {
        // If not, fully zero it out.
        zeroChanges(params);
      }

      // Not the highest resolution timer, but we only use it for inertia decay.
      var t = Date.now();
      if (t0 !== null) decay(t - t0);
      t0 = t;

      // Transfer this flag in a subtle way so that camera.params.dirty is writable.
      camera.state.dirty = willBeDirty;
      willBeDirty = false;

      storeCurrentState();
    },
    taint: taint,
    resize: resize,
    params: params,
    rotate: rotate,
    pivot: pivot,
    pan: pan,
    zoom: zoom,
  };

  camera.state = {
  };

  camera.state.projection = new Float32Array(16);
  camera.state.viewInv = new Float32Array(16);
  camera.state.view = new Float32Array(16);
  camera.state.width = null;
  camera.state.height = null;
  camera.state.eye = new Float32Array(3);

  // Vectors used but not exposed. Not they couldn't be, but you can get these
  // from the view matrix just fine.
  var tmp = new Float32Array(3);
  var viewUp = new Float32Array(3);
  var viewRight = new Float32Array(3);
  var viewForward = new Float32Array(3);
  var origin = new Float32Array(3);
  var dView = new Float32Array(16);

  // Track the previous params so that we can detect changes in these parameters
  var previousState = {
    up: new Float32Array(3),
    center: new Float32Array(3)
  };
  storeCurrentState();

  function storeCurrentState () {
    vec3Copy(previousState.up, params.up);
    vec3Copy(previousState.center, params.center);
    previousState.near = params.near;
    previousState.far = params.far;
    previousState.distance = params.distance;
    previousState.phi = params.phi;
    previousState.theta = params.theta;
    previousState.fovY = params.fovY;
  }

  function paramsVectorHasChanged () {
    if (!vec3Equals(params.up, previousState.up)) return true;
    if (!vec3Equals(params.center, previousState.center)) return true;
    if (params.near !== previousState.near) return true;
    if (params.far !== previousState.far) return true;
    if (params.phi !== previousState.phi) return true;
    if (params.theta !== previousState.theta) return true;
    if (params.distance !== previousState.distance) return true;
    if (params.fovY !== previousState.fovY) return true;
    return false;
  }

  var paramsChanges = {};
  function applyStateChanges () {
    paramsChanges.dPhi = params.phi - previousState.phi;
    paramsChanges.dTheta = params.theta - previousState.theta;
    paramsChanges.zoom = params.distance / previousState.distance - 1;
    params.theta = previousState.theta;
    params.distance = previousState.distance;
    params.phi = previousState.phi;
    paramsChanges.yaw = 0;
    paramsChanges.pitch = 0;
    paramsChanges.panX = 0;
    paramsChanges.panY = 0;
    paramsChanges.panZ = 0;
    paramsChanges.mouseX = 0;
    paramsChanges.mouseY = 0;

    applyViewChanges(paramsChanges);
  }

  // The meat of it. Note that this function is intentionally very simple! There must
  // not be any logic or complexity to this function. The complexity is in moving this
  // view, not constructing it.
  function computeMatrices () {
    // Spherical coords
    camera.state.eye[0] = 0;
    camera.state.eye[1] = 0;
    camera.state.eye[2] = params.distance;
    vec3RotateX(camera.state.eye, camera.state.eye, origin, -params.phi);
    vec3RotateY(camera.state.eye, camera.state.eye, origin, params.theta);
    vec3Add(camera.state.eye, camera.state.eye, params.center);

    // View + projection
    lookAt(camera.state.view, camera.state.eye, params.center, params.up);
    perspective(camera.state.projection, params.fovY, camera.params.aspectRatio, params.near, params.far);

    // For convenience, but also because we already use this, so let's just expose it
    mat4Invert(camera.state.viewInv, camera.state.view);
  }

  // Track this not on the params itself so that you can write camera.params.dirty
  function taint () {
    willBeDirty = true;
  }

  function resize (aspectRatio) {
    camera.params.aspectRatio = aspectRatio
    computeMatrices();
    taint();
  }

  // All of these are mosty unitless, proportional, or at least relative to a window
  // size that doesn't change much so that fixed tolerances seem fine.
  function viewIsChanging () {
    if (Math.abs(params.zoom) > 1e-4) return true;
    if (Math.abs(params.panX) > 1e-4) return true;
    if (Math.abs(params.panY) > 1e-4) return true;
    if (Math.abs(params.panZ) > 1e-4) return true;
    if (Math.abs(params.dTheta) > 1e-4) return true;
    if (Math.abs(params.dPhi) > 1e-4) return true;
    if (Math.abs(params.yaw) > 1e-4) return true;
    if (Math.abs(params.pitch) > 1e-4) return true;
  }

  function zeroChanges (obj) {
    obj.zoom = 0;
    obj.dTheta = 0;
    obj.dPhi = 0;
    obj.panX = 0;
    obj.panY = 0;
    obj.panZ = 0;
    obj.yaw = 0;
    obj.pitch = 0;
  }

  // Exponential decay. Basically time-correct proportional decay.
  function decay (dt) {
    var panDecay = params.panDecayTime ? Math.exp(-dt / params.panDecayTime / Math.LN2) : 0;
    var zoomDecay = params.zoomDecayTime ? Math.exp(-dt / params.zoomDecayTime / Math.LN2) : 0;
    var rotateDecay = params.rotationDecayTime ? Math.exp(-dt / params.rotationDecayTime / Math.LN2) : 0;
    params.zoom *= zoomDecay;
    params.panX *= panDecay;
    params.panY *= panDecay;
    params.panZ *= panDecay;
    params.dTheta *= rotateDecay;
    params.dPhi *= rotateDecay;
    params.yaw *= rotateDecay;
    params.pitch *= rotateDecay;
  }

  // Accumulate changes per-frame since it turns out that Safari dispatches mouse events
  // more than once per RAF while chrome sticks to strictly once per RAF. How surprising!
  var accumulator = {};
  zeroChanges(accumulator);

  function pan (panX, panY) {
    var scaleFactor = camera.params.distance * Math.tan(camera.params.fovY * 0.5) * 2.0;
    accumulator.panX += panX * params.aspectRatio * scaleFactor;
    accumulator.panY += panY * scaleFactor;
    return camera;
  }

  function zoom (mouseX, mouseY, zoom) {
    accumulator.zoom += zoom;
    params.mouseX = mouseX;
    params.mouseY = mouseY;
    return camera;
  }

  function pivot (yaw, pitch) {
    var scaleFactor = camera.params.fovY;
    accumulator.yaw += yaw * scaleFactor * params.aspectRatio;
    accumulator.pitch += pitch * scaleFactor;
  }

  function rotate (dTheta, dPhi) {
    accumulator.dTheta += dTheta;
    accumulator.dPhi += dPhi;
  }

  function applyViewChanges (changes) {
    var zoomScaleFactor;

    // Initialize a veiw-space transformation for panning and zooming
    mat4Identity(dView);

    // Zoom about the mouse location in view-space
    if (params.zoomAboutCursor) {
      zoomScaleFactor = params.distance * Math.tan(params.fovY * 0.5);
      tmp[0] = changes.mouseX * params.aspectRatio * zoomScaleFactor;
      tmp[1] = changes.mouseY * zoomScaleFactor;
      tmp[2] = 0;
      mat4Translate(dView, dView, tmp);
    }

    tmp[0] = 1 + changes.zoom;
    tmp[1] = 1 + changes.zoom;
    tmp[2] = 1;
    mat4Scale(dView, dView, tmp);

    if (params.zoomAboutCursor) {
      zoomScaleFactor = params.distance * Math.tan(params.fovY * 0.5);
      tmp[0] = -changes.mouseX * params.aspectRatio * zoomScaleFactor;
      tmp[1] = -changes.mouseY * zoomScaleFactor;
      tmp[2] = 0;
      mat4Translate(dView, dView, tmp);
    }

    // Pan the view matrix
    dView[12] -= changes.panX * 0.5;
    dView[13] -= changes.panY * 0.5;

    // transform into view space, then transfor, then invert again
    transformMat4(params.center, params.center, camera.state.view);
    transformMat4(params.center, params.center, dView);
    transformMat4(params.center, params.center, camera.state.viewInv);

    // If rotating about the center of the screen, then copy center -> rotationCenter
    if (params.rotateAboutCenter) {
      vec3Copy(params.rotationCenter, params.center);
    }

    params.distance *= 1 + changes.zoom;

    var prevPhi = params.phi;
    params.phi += changes.dPhi;
    params.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, params.phi));
    var dPhi = params.phi - prevPhi;

    var prevTheta = params.theta;
    params.theta += changes.dTheta;
    var dTheta = params.theta - prevTheta;

    vec3RotateY(params.center, params.center, params.rotationCenter, dTheta - params.theta);
    vec3RotateX(params.center, params.center, params.rotationCenter, -dPhi);
    vec3RotateY(params.center, params.center, params.rotationCenter, params.theta);

    if (changes.yaw !== 0 || changes.pitch !== 0) {
      viewRight[0] = camera.state.view[0];
      viewRight[1] = camera.state.view[4];
      viewRight[2] = camera.state.view[8];
      vec3Normalize(viewRight, viewRight);

      viewUp[0] = camera.state.view[1];
      viewUp[1] = camera.state.view[5];
      viewUp[2] = camera.state.view[9];
      vec3Normalize(viewUp, viewUp);

      viewForward[0] = camera.state.view[2];
      viewForward[1] = camera.state.view[6];
      viewForward[2] = camera.state.view[10];
      vec3Normalize(viewForward, viewForward);

      var clippedPhi = Math.min(MAX_PHI, Math.max(MIN_PHI, params.phi + changes.pitch * 0.5));
      var clippedPitch = clippedPhi - params.phi;

      vec3ScaleAndAdd(params.center, params.center, viewRight, -Math.sin(changes.yaw * 0.5) * params.distance);
      vec3ScaleAndAdd(params.center, params.center, viewUp, -Math.sin(clippedPitch) * params.distance);
      vec3ScaleAndAdd(params.center, params.center, viewForward, (2 - Math.cos(changes.yaw * 0.5) - Math.cos(clippedPitch)) * params.distance);
      params.phi = clippedPhi;
      params.theta += changes.yaw * 0.5;
    }

    computeMatrices();
    taint();
  }

  resize(camera.params.aspectRatio);

  return camera;
}

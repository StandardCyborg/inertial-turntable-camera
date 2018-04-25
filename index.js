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

module.exports = function Camera (opts) {
  opts = opts || {};

  // A proxy flag with which we track the dirty state so that it doesn't need
  // an extra method to tell the camera that the scene *has been* rendered.
  var willBeDirty = true;

  var state = {
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
      // If we've accumulated interactions, then set them in the state directly.
      // Alternatively, we could recompute the full state on every single interaction
      // event, but that would result in maybe twice as many full matrix/view updates
      // as could ever be rendered in browsers like Safari that dispatch multiple
      // events per requestAnimationFrame.
      if (accumulator.zoom) state.zoom = accumulator.zoom;
      if (accumulator.dTheta) state.dTheta = accumulator.dTheta;
      if (accumulator.dPhi) state.dPhi = accumulator.dPhi;
      if (accumulator.panX) state.panX = accumulator.panX;
      if (accumulator.panY) state.panY = accumulator.panY;
      if (accumulator.panZ) state.panZ = accumulator.panZ;
      if (accumulator.yaw) state.yaw = accumulator.yaw;
      if (accumulator.pitch) state.pitch = accumulator.pitch;
      zeroChanges(accumulator);

      if (mergeState) {
        // Okay, so if we just merge changes, that totally breaks mouse interaction
        // because provided dPhi will zero out dPhi resulting from mouse interaction.
        // It would be better to accumulate mouse pixel changes separately and then
        // add this in afterwards, but since we've accumulated dPhi etc right in the
        // state, we need to cache this, then merge changes, then add these back in
        // if necessary. Consider this a low-priority cleanup item.
        var cachedDPhi = state.dPhi;
        var cachedDTheta = state.dTheta;
        var cachedZoom = state.zoom;
        var cachedPanX = state.panX;
        var cachedPanY = state.panY;
        var cachedPanZ = state.panZ;
        var cachedPitch = state.pitch;
        var cachedYaw = state.yaw;

        if (mergeState.dirty !== undefined) {
          willBeDirty = true;
        }

        // This merges anything and everything in the state vector.
        Object.assign(state, mergeState);

        // Yup, so add them back in.
        if (mergeState.dPhi !== undefined) state.dPhi += cachedDPhi;
        if (mergeState.dTheta !== undefined) state.dTheta += cachedDTheta;
        if (mergeState.zoom !== undefined) state.zoom += cachedZoom;
        if (mergeState.panX !== undefined) state.panX += cachedPanX;
        if (mergeState.panY !== undefined) state.panY += cachedPanY;
        if (mergeState.panZ !== undefined) state.panZ += cachedPanZ;
        if (mergeState.pitch !== undefined) state.pitch += cachedPitch;
        if (mergeState.yaw !== undefined) state.yaw += cachedYaw;
      }

      // Check for and apply passive changes to the state vector. That is, if you
      // set camera.state.distance, this will automatically factor in those changes.
      if (stateVectorHasChanged()) {
        applyStateChanges();
      }

      // Check if the view is changing above some threshold tolerance.
      if (viewIsChanging()) {
        // If so, update the view.
        applyViewChanges(state);
      } else {
        // If not, fully zero it out.
        zeroChanges(state);
      }

      // Not the highest resolution timer, but we only use it for inertia decay.
      var t = Date.now();
      if (t0 !== null) decay(t - t0);
      t0 = t;

      // Transfer this flag in a subtle way so that camera.state.dirty is writable.
      state.dirty = willBeDirty;
      willBeDirty = false;

      storeCurrentState();
    },
    taint: taint,
    resize: resize,
    state: state,
    rotate: rotate,
    pivot: pivot,
    pan: pan,
    zoom: zoom,
  };

  camera.projection = new Float32Array(16);
  camera.viewInv = new Float32Array(16);
  camera.view = new Float32Array(16);
  camera.width = null;
  camera.height = null;
  camera.eye = new Float32Array(3);

  // Vectors used but not exposed. Not they couldn't be, but you can get these
  // from the view matrix just fine.
  var tmp = new Float32Array(3);
  var viewUp = new Float32Array(3);
  var viewRight = new Float32Array(3);
  var viewForward = new Float32Array(3);
  var origin = new Float32Array(3);
  var dView = new Float32Array(16);

  // Track the previous state so that we can detect changes in these parameters
  var previousState = {
    up: new Float32Array(3),
    center: new Float32Array(3)
  };
  storeCurrentState();

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

  function stateVectorHasChanged () {
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
    stateChanges.mouseX = 0;
    stateChanges.mouseY = 0;

    applyViewChanges(stateChanges);
  }

  // The meat of it. Note that this function is intentionally very simple! There must
  // not be any logic or complexity to this function. The complexity is in moving this
  // view, not constructing it.
  function computeMatrices () {
    // Spherical coords
    camera.eye[0] = 0;
    camera.eye[1] = 0;
    camera.eye[2] = state.distance;
    vec3RotateX(camera.eye, camera.eye, origin, -state.phi);
    vec3RotateY(camera.eye, camera.eye, origin, state.theta);
    vec3Add(camera.eye, camera.eye, state.center);

    // View + projection
    lookAt(camera.view, camera.eye, state.center, state.up);
    perspective(camera.projection, state.fovY, camera.state.aspectRatio, state.near, state.far);

    // For convenience, but also because we already use this, so let's just expose it
    mat4Invert(camera.viewInv, camera.view);
  }

  // Track this not on the state itself so that you can write camera.state.dirty
  function taint () {
    willBeDirty = true;
  }

  function resize (aspectRatio) {
    camera.state.aspectRatio = aspectRatio
    computeMatrices();
    taint();
  }

  // All of these are mosty unitless, proportional, or at least relative to a window
  // size that doesn't change much so that fixed tolerances seem fine.
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

  // Accumulate changes per-frame since it turns out that Safari dispatches mouse events
  // more than once per RAF while chrome sticks to strictly once per RAF. How surprising!
  var accumulator = {};
  zeroChanges(accumulator);

  function pan (panX, panY) {
    var scaleFactor = camera.state.distance * Math.tan(camera.state.fovY * 0.5) * 2.0;
    accumulator.panX += panX * state.aspectRatio * scaleFactor;
    accumulator.panY += panY * scaleFactor;
    return camera;
  }

  function zoom (mouseX, mouseY, zoom) {
    accumulator.zoom += zoom;
    state.mouseX = mouseX;
    state.mouseY = mouseY;
    return camera;
  }

  function pivot (yaw, pitch) {
    var scaleFactor = camera.state.fovY;
    accumulator.yaw += yaw * scaleFactor * state.aspectRatio;
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
    if (state.zoomAboutCursor) {
      zoomScaleFactor = state.distance * Math.tan(state.fovY * 0.5);
      tmp[0] = changes.mouseX * state.aspectRatio * zoomScaleFactor;
      tmp[1] = changes.mouseY * zoomScaleFactor;
      tmp[2] = 0;
      mat4Translate(dView, dView, tmp);
    }

    tmp[0] = 1 + changes.zoom;
    tmp[1] = 1 + changes.zoom;
    tmp[2] = 1;
    mat4Scale(dView, dView, tmp);

    if (state.zoomAboutCursor) {
      zoomScaleFactor = state.distance * Math.tan(state.fovY * 0.5);
      tmp[0] = -changes.mouseX * state.aspectRatio * zoomScaleFactor;
      tmp[1] = -changes.mouseY * zoomScaleFactor;
      tmp[2] = 0;
      mat4Translate(dView, dView, tmp);
    }

    // Pan the view matrix
    dView[12] -= changes.panX * 0.5;
    dView[13] -= changes.panY * 0.5;

    // transform into view space, then transfor, then invert again
    transformMat4(state.center, state.center, camera.view);
    transformMat4(state.center, state.center, dView);
    transformMat4(state.center, state.center, camera.viewInv);

    // If rotating about the center of the screen, then copy center -> rotationCenter
    if (state.rotateAboutCenter) {
      vec3Copy(state.rotationCenter, state.center);
    }

    state.distance *= 1 + changes.zoom;

    var prevPhi = state.phi;
    state.phi += changes.dPhi;
    state.phi = Math.min(Math.PI * 0.5 - 1e-4, Math.max(-Math.PI * 0.5 + 1e-6, state.phi));
    var dPhi = state.phi - prevPhi;

    var prevTheta = state.theta;
    state.theta += changes.dTheta;
    var dTheta = state.theta - prevTheta;

    vec3RotateY(state.center, state.center, state.rotationCenter, dTheta - state.theta);
    vec3RotateX(state.center, state.center, state.rotationCenter, -dPhi);
    vec3RotateY(state.center, state.center, state.rotationCenter, state.theta);

    if (changes.yaw !== 0 || changes.pitch !== 0) {
      viewRight[0] = camera.view[0];
      viewRight[1] = camera.view[4];
      viewRight[2] = camera.view[8];
      vec3Normalize(viewRight, viewRight);

      viewUp[0] = camera.view[1];
      viewUp[1] = camera.view[5];
      viewUp[2] = camera.view[9];
      vec3Normalize(viewUp, viewUp);

      viewForward[0] = camera.view[2];
      viewForward[1] = camera.view[6];
      viewForward[2] = camera.view[10];
      vec3Normalize(viewForward, viewForward);

      vec3ScaleAndAdd(state.center, state.center, viewRight, -Math.sin(changes.yaw * 0.5) * state.distance);
      vec3ScaleAndAdd(state.center, state.center, viewUp, -Math.sin(changes.pitch * 0.5) * state.distance);
      vec3ScaleAndAdd(state.center, state.center, viewForward, (2 - Math.cos(changes.yaw * 0.5) - Math.cos(changes.pitch * 0.5)) * state.distance);
      state.phi += changes.pitch * 0.5;
      state.theta += changes.yaw * 0.5;
    }

    computeMatrices();
    taint();
  }

  resize(camera.state.aspectRatio);

  return camera;
}

# inertial-turntable-camera

> A 3D spherical coordinates camera with inertia

[Live demo](https://standardcyborg.github.io/inertial-turntable-camera/)

## Introduction

A 3D spherical coordinate camera with rotation, panning, zooming, and pivoting (i.e. yaw and pitch). The main feature that requires explanation is that it has separate variables `center` and `rotationCenter` to decouple the center of rotation from the center of the view so you can allow people to pan the view but avoid the problem where suddenly you're rotating about some unexpected point in space.

This module plugs nicely into [regl](https://github.com/regl-project/regl). Feeding interactions into it is left as an exercise for the developer, though you might try [normalized-interaction-events](https://github.com/rreusser/normalized-interaction-events) and see [demo](./demo.js) for an example.

## Example

```javascript
const camera = require('inertial-turntable-camera')({
  phi: 0.5,
  theta: 1,
  distance: 20,
});

requestAnimationFrame(() => {
  // Pan slowly to the right by setting params directly
  camera.params.panX = 0.001;

  // Call tick to compute the current eye location and view+projection matrices
  camera.tick({
    // Otherwise pass params changes here:
    panX: 0.001
  });

  // camera.state.view => [...]
  // camera.state.projection => [...]

  if (camera.state.dirty) {
    renderScene();
  }
});
```

See [demo.js](./demo.js) for fully worked example.

## Usage

### `camera = require('inertial-turntable-camera')([opts])`

Returns a camera instance which sets camera projection and view matrix context and uniforms. Options are fed into the initial params and can be modified by modifying `camera.params` or when calling `camera.tick`.

### Methods

#### `camera.taint()`

Mark the camera "dirty" so that the next tick will set `camera.state.dirty = true`, indicating the scene needs to be re-rendered.

#### `camera.resize(aspectRatio)`

Updates the aspect ratio (width / height) and mark the view dirty.

#### `camera.tick([paramsChanges])`

The tick method applies the following sequence of operations:

  1. Optionally applies an object of paramsChanges to `camera.params`
  2. Applies changes detected in the camera params
  3. Applies batched mouse interactions accumulate since the last update
  4. Updates the view and projection matrices and the eye position
  5. Sets `camera.state.dirty` to indicate whether the scene needs to be re-rendered


### Read-only values: `camera.state.*`

`camera.state` contains the following _computed_ properties so that any changes will be ignored and overwritten.

| Camera variable | Type | Meaning |
| -------------- | ---- | ------- |
| `dirty` | Boolean | true when camera view has changed |
| `eye` | vec3 | location of camera |
| `projection` | mat4 | projection matrix |
| `view` | mat4 | view matrix |
| `viewInv` | mat4 | inverese view matrix |

### Read/writeable params: `camera.params.*`

The returned camera contains a `params` property which contains the following values, all of which may be written directly. On each invocation of `draw` these parameters will be checked for differences and will trigger a dirty camera where applicable so that the view is redrawn automatically. After checking for changes though, these values may be modified depending on input interactions.

| State variable | Type | Default/Initial | Meaning |
| -------------- | ---- | ------- | ------- |
| `aspectRatio` | Number | current aspect ratio |
| `center` | vec3 | `[0, 0, 0]` | point at the center of the view |
| `distance` | Number | `10` |  distance of eye from center |
| `dPhi` | Number | `0` | current phi inertia of camera |
| `dTheta` | Number | `0` | current theta inertia of camera |
| `far` | Number | `100` | far clipping plane |
| `fovY` | Number | `π / 4` | field of view in the vertical direction, in radians |
| `near` | Number | `0.1` | near clipping plane |
| `panDecayTime` | Number | `100` | half life of panning inertia in ms |
| `panX` | Number | `0` | current horizontal amount to pan at next draw |
| `panY` | Number | `0` | current vertical amount to pan at next draw |
| `panZ` | Number | `0` | current in/out of plane amount to pan at next draw |
| `phi` | Number | `0` | azimuthal angle of camera |
| `pitch` | Number | `0` | current amount to pitch at next draw, in radians |
| `rotationCenter` | vec3 | `[0, 0, 0]` | point about which the view rotates
| `rotationDecayTime` | Number | `100` | half life of rotation inertia in ms |
| `rotateAboutCenter` | Boolean | `false` | If false, rotate about `rotationCenter`, otherwise rotates about the current view center. |
| `theta` | Number | `0` | horizontal rotation of camera |
| `up` | vec3 | `[0, 1, 0]` | vertical direction |
| `mouseX` | Number | `null` | current horizontal location of interaction, in pixels |
| `mouseY` | Number | `null` | current vertical location of interaction, in pixels |
| `yaw` | Number | `0` | current amount to yaw at next draw, in radians |
| `zoom` | Number | `0` | current amount to zoom at next draw (0 = no change) |
| `zoomDecayTime` | Number | `100` | half life of zooming inertia in ms |

## See also

- [regl-camera](https://github.com/regl-project/regl-camera)

## Credits

This module is heavily based on the work of [mikolalysenko](https://github.com/mikolalysenko) and [mattdesl](https://github.com/mattdesl).
Development supported by [Standard Cyborg](https://standardcyborg.com).

<img width="100px" src="img/sc.png" />

## License

&copy; 2018 Ricky Reusser. MIT License.

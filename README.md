# inertial-turntable-camera

> A 3D spherical coordinates camera, for desktop and mobile

[Live demo](https://standardcyborg.github.io/inertial-turntable-camera/)

## Introduction

A 3D spherical coordinate camera with rotation, panning, zooming, and pivoting (i.e. yaw and pitch). Designed to function on desktop and mobile. The main feature that requires explanation is that it has a flag to decouple the center of rotation from the center of the view so you can allow people to pan the view but avoid the problem where suddenly you're rotating about some unexpected point in space.

I encourage you to think of this as code which should be harvested, mutilated, and modified as you see fit rather than code that should be refined to emcompass every use case. PRs welcome though!

## Example

```javascript
const camera = require('inertial-turntable-camera')({
  element: myCanvas,
  phi: 0.5,
  theta: 1,
  distance: 20,
});

requestAnimationFrame(() => {
  // Pan slowly to the right by changing state directly
  camera.state.panX = 0.001;

  // Call update to compute the current eye location and view+projection matrices
  camera.update({
    // Otherwise pass state changes here:
    panX: 0.001
  });

  // camera.view => [...]
  // camera.projection => [...]

  renderScene();
});
```

See [demo.js](./demo.js) for fully worked example.

## Usage

### `camera = require('inertial-turntable-camera')([opts])`

Returns a camera instance which sets camera projection and view matrix context and uniforms. Configuration options are:

| Option | Type | Default | Meaning |
| ------ | ----- | ------ | ------- |
| `element` | HTML element | `window` | element to which to attach |

#### Methods: `camera.*()`

Finally, the returned camera contains the following methods:

| Method | Meaning |
| -------| ------- |
| .taint() | Mark the view "dirty" to trigger drawing on the next frame. |
| .resize() | Recompute the viewport size and aspect ratio and mark the view dirty |
| .udpate([opts]) | Update the camera for the current frame |


#### Read-only values: `camera.*`

The returned camera contains the following _computed_ properties which will be overwritten on every draw frame and so _cannot_ (meaningfully) be modified:

| Camera variable | Type | Meaning |
| -------------- | ---- | ------- |
| `aspectRatio` | Number | current aspect ratio |
| `dirty` | Boolean | `true` | true when camera view has changed |
| `eye` | vec3 | location of camera |
| `height` | Number | current height of view |
| `projection` | mat4 | projection matrix |
| `view` | mat4 | view matrix |
| `viewInv` | mat4 | inverese view matrix |
| `width` | Number | current width of view |

#### Read/writeable state: `camera.state.*`

The returned camera contains a `.state` property which contains the following state values, all of which may be written directly. On each invocation of `draw` these parameters will be checked for differences and will trigger a dirty camera where applicable so that the view is redrawn automatically.

| State variable | Type | Default/Initial | Meaning |
| -------------- | ---- | ------- | ------- |
| `center` | vec3 | `[0, 0, 0]` | point at the center of the view |
| `distance` | Number | `10` |  distance of eye from center |
| `dPhi` | Number | `0` | current phi inertia of camera |
| `dTheta` | Number | `0` | current theta inertia of camera |
| `enablePan` | Boolean | `true` | allow panning |
| `enablePivot` | Boolean | `true` | allow pivoting (yaw and pitch) of view |
| `enableRotation` | Boolean | `true` | allow rotation view |
| `enableZoom` | Boolean | `true` | allow zooming of view |
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
| `rotationSpeed` | Number | `1.0` | Speed of rotation interaction |
| `rotationDecayTime` | Number | `100` | half life of rotation inertia in ms |
| `rotateAboutCenter` | Boolean | `false` | If false, rotate about `rotationCenter`, otherwise rotates about the current view center. |
| `theta` | Number | `0` | horizontal rotation of camera |
| `up` | vec3 | `[0, 1, 0]` | vertical direction |
| `wheelSpeed` | Number | `1.0` | Speed of mouse wheel interaction |
| `x0` | Number | `null` | current horizontal location of interaction, in pixels |
| `y0` | Number | `null` | current vertical location of interaction, in pixels |
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

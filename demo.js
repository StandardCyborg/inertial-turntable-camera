const bunny = require('bunny');
const angleNormals = require('angle-normals');
const createCamera = require('./');
const controlPanel = require('control-panel');
const vec3Copy = require('gl-vec3/copy');
const regl = require('regl')({
  extensions: ['oes_standard_derivatives'],
  pixelRatio: Math.min(1.5, window.devicePixelRatio),
  attributes: {
    antialias: false
  },
  onDone: require('fail-nicely')(run)
});

function run (regl) {
  bunny.normals = angleNormals(bunny.cells, bunny.positions);
  const camera = window.camera = createCamera(regl, {
    distance: 20,
    center: [0, 4, 0],
  });

  const r = 30.0;
  const drawGrid = regl({
    vert: `
      precision mediump float;
      attribute vec3 position;
      varying vec2 p;
      uniform mat4 projection, view;
      varying vec3 n;
      void main () {
        p = position.xz;
        gl_Position = projection * view * vec4(position, 1);
      }`,
    frag: `
      #extension GL_OES_standard_derivatives : enable
      precision mediump float;
      float gridFactor (vec2 parameter, float width, float feather) {
        float w1 = width - feather * 0.5;
        vec2 d = fwidth(parameter);
        vec2 a2 = smoothstep(d * w1, d * (w1 + feather), 0.5 - abs(mod(parameter, 1.0) - 0.5));
        return min(a2.x, a2.y);
      }
      uniform float lineWidth;
      varying vec2 p;
      varying vec3 n;
      void main () {
        float r = length(p);
        float grid = (1.0 - gridFactor(p, lineWidth, 1.0)) * smoothstep(30.0, 0.0, r);
        if (grid < 0.001) discard;
        gl_FragColor = vec4(0, 0, 0, 0.5 * grid);
      }`,
    attributes: {position: [-r, 0, -r, r, 0, -r, r, 0, r, -r, 0, r]},
    uniforms: {lineWidth: ctx => 0.5 * ctx.pixelRatio},
    blend: {
      enable: true,
      func: {
        srcRGB: 'src alpha',
        srcAlpha: 1,
        dstRGB: 'one minus src alpha',
        dstAlpha: 1
      }
    },
    elements: [0, 1, 2, 0, 2, 3],
    count: 6
  });

  const drawBunny = regl({
    vert: `
      precision mediump float;
      attribute vec3 positions, normals;
      uniform mat4 projection, view;
      varying vec3 n;
      void main () {
        n = normals;
        gl_Position = projection * view * vec4(positions, 1);
      }`,
    frag: `
      precision mediump float;
      varying vec3 n;
      void main () {
        gl_FragColor = vec4(0.5 + 0.5 * n, 1);
      }`,
    cull: {enable: true, face: 'back'},
    attributes: bunny,
    elements: bunny.cells,
    count: bunny.cells.length * 3
  });

  regl.frame(({time}) => {
    camera({
      near: camera.state.distance * 0.01,
      far: camera.state.distance * 2 + 200
    }, state => {
      if (!state.dirty) return;
      regl.clear({color: [0.8, 0.85, 0.9, 1], depth: 1});
      drawBunny();
      drawGrid();
    });
  });

  window.addEventListener('resize', camera.resize, false);


  const cpEl = document.createElement('div');
  document.body.appendChild(cpEl);
  var showHide;
  var controlWidth = Math.min(360, window.innerWidth);
  if (true) {
    showHide = document.createElement('button');
    showHide.textContent = 'Show/hide controls';
    cpEl.appendChild(showHide);
    showHide.style.display = 'block';
    showHide.style.width = controlWidth + 'px';
    showHide.style.background = 'rgb(35, 35, 35)';
    showHide.style.border = 'none';
    showHide.style.position = 'relative';
    showHide.style.borderRadius = '0';
    showHide.style.padding = '5px 15px';
    showHide.style.color = 'rgb(235, 235, 235)';
    showHide.style.opacity = '0.95';
    showHide.style.fontFamily = "'Hack', monospace";
    showHide.style.cursor = 'pointer';
    showHide.style.margin = '0';

    showHide.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      if (cpContent.style.display === 'block') {
        showHide.style.width = 'auto';
        cpContent.style.display = 'none';
      } else {
        showHide.style.width = controlWidth + 'px';
        cpContent.style.display = 'block';
      }
    });
  }
  const cpContent = document.createElement('div');
  cpContent.style.display = 'block';
  cpEl.appendChild(cpContent);

  const helptext = document.createElement('div');
  helptext.textContent = 'On desktop, drag to rotate; shift + drag to pan; meta + drag to pivot; mouswheel to zoom. On mobile, drag to rotate, pinch to zoom and pan.';
  helptext.style.width = controlWidth + 'px';
  helptext.style.background = 'rgb(35, 35, 35)';
  helptext.style.color = 'rgb(235, 235, 235)';
  helptext.style.padding = '5px 15px';
  helptext.style.boxSizing = 'border-box';
  helptext.style.opacity = '0.95';
  helptext.style.fontFamily = "'Hack', monospace";
  helptext.style.fontSize = '0.7em';
  helptext.style.display = 'inline-block';

  cpContent.appendChild(helptext)
  controlPanel([
    {label: 'inertia', type: 'range', min: 0, max: 1000, step: 10, initial: camera.state.panDecayTime},
    {label: 'fov', type: 'range', min: 5, max: 100, step: 1, initial: Math.round(180 / Math.PI * camera.state.fovY)},
    {label: 'zoomAboutCursor', type: 'checkbox', initial: camera.state.zoomAboutCursor},
    {label: 'rotateAboutCenter', type: 'checkbox', initial: camera.state.rotateAboutCenter},
  ], {
    root: cpContent,
    width: controlWidth
  }).on('input', function (data) {
    camera.state.zoomAboutCursor = data.zoomAboutCursor;
    camera.state.panDecayTime = data.inertia;
    camera.state.zoomDecayTime = data.inertia;
    camera.state.rotationDecayTime = data.inertia;
    camera.state.rotateAboutCenter = data.rotateAboutCenter;

		// Hold the view constant as we change the fov
    var prevYRange = camera.state.distance * Math.tan(camera.state.fovY * 0.5);
    camera.state.fovY = data.fov * Math.PI / 180.0;
    camera.state.distance = prevYRange / Math.tan(camera.state.fovY * 0.5);

    camera.state.fovY = data.fov * Math.PI / 180;
  });

	cpEl.addEventListener('touchstart', e => e.stopPropagation());
  cpEl.addEventListener('touchend', e => e.stopPropagation());
  cpEl.addEventListener('touchmove', e => e.stopPropagation());
  cpEl.addEventListener('touchcancel', e => e.stopPropagation());
  document.querySelector('.github-corner').addEventListener('touchstart', e => e.stopPropagation());
  document.querySelector('.github-corner').addEventListener('touchmove', e => e.stopPropagation());
  document.querySelector('.github-corner').addEventListener('touchend', e => e.stopPropagation());


}

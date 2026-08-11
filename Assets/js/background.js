/* Interactive palette-shader background.
   Shared by index.html and shop.html. Renders into <canvas id="bg">.
   If WebGL is unavailable the canvas is hidden and the CSS gradient on <body> shows through. */
(function () {
  var canvas = document.getElementById('bg');
  if (!canvas) return;

  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  // No WebGL → keep the CSS gradient fallback on <body>.
  if (!gl) { canvas.style.display = 'none'; return; }

  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_mouse;',
    'uniform sampler2D u_tex;',
    'uniform float u_imgAspect;',

    'float hash(vec2 p){',
    '  p = fract(p * vec2(123.34, 345.45));',
    '  p += dot(p, p + 34.345);',
    '  return fract(p.x * p.y);',
    '}',

    'float noise(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',

    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
    '  for(int i = 0; i < 6; i++){',
    '    v += a * noise(p);',
    '    p = m * p;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',

    'void main(){',
    // Cover-fit the palette image to the viewport
    '  vec2 screenUV = gl_FragCoord.xy / u_res.xy;',
    '  float V = u_res.x / u_res.y;',
    '  float scaleX = min(V / u_imgAspect, 1.0);',
    '  float scaleY = min(u_imgAspect / V, 1.0);',
    '  float panCenter = 0.5 + (0.5 - 0.5 * scaleY) * sin(u_time * 0.035);',   // slow vertical pan through the tall image
    '  vec2 uv;',
    '  uv.x = 0.5 + (screenUV.x - 0.5) * scaleX;',
    '  uv.y = panCenter + (screenUV.y - 0.5) * scaleY;',

    // Domain-warp the sample coords so the image slowly melts + reacts to the cursor
    '  float t = u_time * 0.03;',
    '  vec2 p = uv;',
    '  vec2 q = vec2(fbm(p * 3.0 + t), fbm(p * 3.0 + vec2(5.2, 1.3) - t));',
    '  vec2 r = vec2(fbm(p * 3.0 + 2.0 * q + vec2(1.7, 9.2) + t * 0.5), fbm(p * 3.0 + 2.0 * q + vec2(8.3, 2.8)));',
    '  vec2 warp = (r - 0.5) * 0.10 + (u_mouse - 0.5) * 0.05;',
    '  warp.x *= scaleX; warp.y *= scaleY;',   // keep the melt proportional to the visible band

    '  vec2 suv = clamp(uv + warp, 0.002, 0.998);',
    '  vec3 col = texture2D(u_tex, suv).rgb;',

    '  float md = distance(screenUV, u_mouse);',
    '  col += 0.03 * smoothstep(0.4, 0.0, md);',             // gentle glow at the cursor

    '  float g = hash(gl_FragCoord.xy + fract(u_time) * 100.0);',
    '  col += (g - 0.5) * 0.035;',                           // film grain

    '  col = clamp(col, 0.0, 1.0);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Full-screen triangle
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes       = gl.getUniformLocation(prog, 'u_res');
  var uTime      = gl.getUniformLocation(prog, 'u_time');
  var uMouse     = gl.getUniformLocation(prog, 'u_mouse');
  var uTex       = gl.getUniformLocation(prog, 'u_tex');
  var uImgAspect = gl.getUniformLocation(prog, 'u_imgAspect');

  // Palette image loaded as a texture — its colours are the whole look
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([230, 150, 130, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  var imgAspect = 1.6;
  var img = new Image();
  img.onload = function () {
    imgAspect = img.width / img.height;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  };
  // Prefer the wide palette image; fall back to the earlier one.
  img.onerror = function () { img.onerror = null; img.src = 'Assets/Images/palette_bg.jpg'; };
  img.src = 'Assets/Images/palette_bg2.jpg';

  // Mouse (smoothed), starts centred
  var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  function setTarget(cx, cy){
    mouse.tx = cx / window.innerWidth;
    mouse.ty = 1.0 - cy / window.innerHeight;   // flip to GL space
  }
  window.addEventListener('mousemove', function (e) { setTarget(e.clientX, e.clientY); });
  window.addEventListener('touchmove', function (e) {
    if (e.touches[0]) setTarget(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  function resize(){
    var w = Math.floor(window.innerWidth  * DPR);
    var h = Math.floor(window.innerHeight * DPR);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  var running = true;
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) requestAnimationFrame(frame);
  });

  var start = null;
  function frame(ts){
    if (!running) return;
    if (start === null) start = ts;
    var time = (ts - start) / 1000;

    mouse.x += (mouse.tx - mouse.x) * 0.025;
    mouse.y += (mouse.ty - mouse.y) * 0.025;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uTex, 0);
    gl.uniform1f(uImgAspect, imgAspect);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

"use strict";

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
  alert("WebGL2 not supported");
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(vsSource, fsSource) {
  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// Math helpers
function mat4Identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return out;
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2.0);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0,
  ];
}

function vec3Normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mat4LookAt(eye, target, up) {
  const z = vec3Normalize(vec3Subtract(eye, target));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ];
}

function mat4Translate(tx, ty, tz) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ];
}

function mat4Scale(sx, sy, sz) {
  return [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotateY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotateX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4InverseTranspose3x3(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) det = 1;
  det = 1.0 / det;
  return [
    b01 * det,
    (-a22 * a01 + a02 * a21) * det,
    (a12 * a01 - a02 * a11) * det,
    b11 * det,
    (a22 * a00 - a02 * a20) * det,
    (-a12 * a00 + a02 * a10) * det,
    b21 * det,
    (-a21 * a00 + a01 * a20) * det,
    (a11 * a00 - a01 * a10) * det,
  ];
}

function createSphere(radius, segments, rings) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;
      const px = radius * Math.sin(theta) * Math.cos(phi);
      const py = radius * Math.cos(theta);
      const pz = radius * Math.sin(theta) * Math.sin(phi);
      positions.push(px, py, pz);
      const n = vec3Normalize([px, py, pz]);
      normals.push(n[0], n[1], n[2]);
    }
  }
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const i0 = y * (segments + 1) + x;
      const i1 = i0 + segments + 1;
      indices.push(i0, i1, i0 + 1);
      indices.push(i1, i1 + 1, i0 + 1);
    }
  }
  return { positions, normals, indices };
}

function createTorus(major, minor, segments, sides) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= sides; j++) {
      const v = (j / sides) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const x = (major + minor * cv) * cu;
      const y = minor * sv;
      const z = (major + minor * cv) * su;
      positions.push(x, y, z);
      const nx = cv * cu;
      const ny = sv;
      const nz = cv * su;
      normals.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function createPlane(size) {
  const s = size / 2;
  const positions = [-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s];
  const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const indices = [0, 1, 2, 0, 2, 3];
  return { positions, normals, indices };
}

function createMeshBuffer(mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const interleaved = new Float32Array(mesh.positions.length + mesh.normals.length);
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    interleaved[i * 6 + 0] = mesh.positions[i * 3 + 0];
    interleaved[i * 6 + 1] = mesh.positions[i * 3 + 1];
    interleaved[i * 6 + 2] = mesh.positions[i * 3 + 2];
    interleaved[i * 6 + 3] = mesh.normals[i * 3 + 0];
    interleaved[i * 6 + 4] = mesh.normals[i * 3 + 1];
    interleaved[i * 6 + 5] = mesh.normals[i * 3 + 2];
  }
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices), gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

  gl.bindVertexArray(null);
  return { vao, count: mesh.indices.length };
}

const meshVs = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormal;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(uNormal * aNormal);
  gl_Position = uProj * uView * worldPos;
}
`;

const meshFs = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uBaseColor;
uniform float uShininess;
uniform float uReflective;

out vec4 fragColor;

float intersectSphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float c2 = dot(oc, oc) - r * r;
  float h = b * b - c2;
  if (h < 0.0) return -1.0;
  return -b - sqrt(h);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = normalize(-uLightDir);

  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), uShininess);

  vec3 color = uBaseColor * (0.2 + diff) + uLightColor * spec;

  if (uReflective > 0.5) {
    vec3 R = reflect(-V, N);
    float tPlane = (-vWorldPos.y) / R.y;
    vec3 reflColor = vec3(0.6, 0.7, 0.8);
    if (tPlane > 0.0) {
      vec3 hit = vWorldPos + R * tPlane;
      float checker = step(0.5, fract(hit.x * 0.5) + fract(hit.z * 0.5));
      reflColor = mix(vec3(0.1, 0.15, 0.2), vec3(0.2, 0.25, 0.35), checker);
    }
    float tSphere = intersectSphere(vWorldPos, R, vec3(-1.4, 0.8, -1.5), 0.5);
    if (tSphere > 0.0) {
      vec3 hit = vWorldPos + R * tSphere;
      vec3 n2 = normalize(hit - vec3(-1.4, 0.8, -1.5));
      float lighting = max(dot(n2, L), 0.0);
      reflColor = mix(reflColor, vec3(0.9, 0.4, 0.6), lighting);
    }
    color = mix(color, reflColor, 0.55);
  }

  fragColor = vec4(color, 1.0);
}
`;

const bgVs = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const bgFs = `#version 300 es
precision highp float;

out vec4 fragColor;
in vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;

#define smoothing 0.006
#define TWO_PI 6.28318530718

vec3 skyColor  = vec3(101., 164., 208.) / 255.0;
vec3 skyButton = vec3(178., 208., 232.) / 255.0;
vec3 fieldDark = vec3(44., 62., 40.) / 255.0;
vec3 fieldMid  = vec3(94., 121., 62.) / 255.0;

vec3 lotusCenterLight = vec3(246., 232., 224.) / 255.0;
vec3 lotusCenterDark  = vec3(214., 189., 180.) / 255.0;
vec3 lotusPetalLight  = vec3(252., 245., 248.) / 255.0;
vec3 lotusPetalMid    = vec3(248., 205., 220.) / 255.0;
vec3 lotusPetalEdge   = vec3(233., 170., 195.) / 255.0;
vec3 lotusStem        = vec3(90., 120., 60.) / 255.0;

float randOneD(float x) {
  return fract(sin(x * 52.163) * 268.2156);
}

float TriangularWave(float x) {
  return abs(fract(x) - 0.5) * 4.0 - 1.0;
}

float ConcateTriangularWaves(float amplitude, float period, float translateX, float translateY, float seed, float x) {
  seed = randOneD(seed);
  float toReturn = 0.0;
  for (int i = 0; i < 5; i++) {
    toReturn += TriangularWave((x + seed * 6.0 + translateX + float(i) * (0.125 + seed * 6.0)) * period) * amplitude + translateY;
    amplitude *= 0.85;
    period *= 1.25;
  }
  return toReturn;
}

void DrawHalfVectorWithLength(vec2 origin, vec2 vector, float len, vec2 uv, float size, vec3 lineColor, inout vec3 sceneColor) {
  uv -= origin;
  float v2 = dot(vector, vector);
  float vUv = dot(vector, uv);
  vec2 p = vector * vUv / v2;
  float d = distance(p, uv);
  float m = 1.0 - step(0.0, vUv / v2);
  m += step(len, vUv / v2);
  sceneColor = mix(lineColor, sceneColor, clamp(smoothstep(size, size + 0.01, d) + m, 0.0, 1.0));
}

void DrawStemLeave(vec2 origin, vec2 vector, float len, vec2 uv, float size, vec3 lineColor, inout vec3 sceneColor) {
  uv -= origin;
  float v2 = dot(vector, vector);
  float vUv = dot(vector, uv);
  uv.y += pow(vUv / len, 2.0) * 4.0;
  vec2 p = vector * vUv / v2;
  float d = distance(p, uv);
  float m = 1.0 - step(0.0, vUv / v2);
  m += step(len, vUv / v2);
  size *= smoothstep(0.5, 0.0, abs(vUv - 0.5) / len) * 0.5;
  sceneColor = mix(lineColor, sceneColor, clamp(smoothstep(size, size + 0.01, d) + m, 0.0, 1.0));
}

void DrawLotusPetals(vec2 uv, inout vec3 col, float seed, float offset, vec3 petalBase, vec3 petalEdge) {
  float spread = 0.30;
  vec2 petalSpace = vec2(fract((offset + uv.x) * TWO_PI * spread), uv.y);
  float petalId = floor((uv.x + offset) * TWO_PI * spread);

  float length = 1.05;
  float t = clamp(petalSpace.y / length, 0.0, 1.0);
  float width = smoothstep(0.0, 1.0, 1.0 - t);
  float thickness = width * 0.65;

  petalSpace.x += sin((t + randOneD(petalId + seed)) * 4.0) * 0.25 * smoothstep(0.3, 1.0, t);

  vec3 petalCol = mix(petalBase, petalEdge, smoothstep(0.4, 1.0, t));
  DrawHalfVectorWithLength(vec2(0.5, 0.0), vec2(0.0, 1.0), 1.0, petalSpace, thickness, petalCol, col);
}

void DrawLotus(vec2 uv, float seed, inout vec3 col, float mask) {
  DrawHalfVectorWithLength(vec2(0.0), vec2(0.0, -1.0), 7.0, uv, 0.15, lotusStem, col);

  DrawStemLeave(vec2(0.0, -2.0 + randOneD(seed + 5.125) * -2.0),
    normalize(vec2(max(0.2, randOneD(seed + 712.125)), (randOneD(seed + 81.215) - 0.3) * 0.3)),
    5.0, uv, 0.3 + randOneD(seed + 12.125) * 0.4, lotusStem, col);

  DrawStemLeave(vec2(0.0, -3.0 + randOneD(seed + 61.125) * -2.0),
    normalize(vec2(-1.0 * max(0.2, randOneD(seed + 4.25)), (randOneD(seed + 73.25) - 0.3) * 0.3)),
    5.0, uv, 0.3 + randOneD(seed + 0.125) * 0.4, lotusStem, col);

  uv = vec2(atan(uv.y, uv.x), length(uv) * 0.55);
  vec3 drawnFlower = col;

  DrawLotusPetals(uv, drawnFlower, 53.126 + seed, 0.4 + randOneD(seed), lotusPetalMid, lotusPetalEdge);
  DrawLotusPetals(uv, drawnFlower, 0.0 + seed, randOneD(seed + 7.125) * -0.5, lotusPetalLight, lotusPetalMid);

  drawnFlower = mix(drawnFlower, lotusCenterLight, smoothstep(0.01, 0.01 + smoothing, 0.45 - uv.y));
  drawnFlower = mix(drawnFlower, lotusCenterDark, smoothstep(0.01, 0.01 + smoothing, 0.20 - uv.y));

  col = mix(col, drawnFlower, mask);
}

void DrawLotusField(vec2 ogUv, float seed, vec2 offset, float fieldMask, float totalMovementSpeed, inout vec3 col, float tiling) {
  ogUv += offset;
  ogUv.x += uTime * totalMovementSpeed;
  vec2 flowerRepeatedSpace = vec2(fract(ogUv.x * tiling), ogUv.y * tiling);
  vec2 idFlowerCoord = vec2(floor(ogUv.x * tiling), seed * 21.215);
  flowerRepeatedSpace -= vec2(0.5) + vec2(0.15, 0.5) * (randOneD(dot(idFlowerCoord, vec2(1.126, 26.6))) - 0.5);
  flowerRepeatedSpace *= 4.0 + 0.2 * (randOneD(dot(idFlowerCoord, vec2(8.136, 5.316))) - 0.5);

  DrawLotus(flowerRepeatedSpace, randOneD(dot(idFlowerCoord, vec2(21.126, 8.3216))), col, fieldMask);
}

void DrawMountain(float movementSpeed, vec2 uv, inout vec3 col, float amplitude, float period, float translateY, float funcOffset, float translateX, float seed, vec3 mountainColor) {
  float movement = uTime * movementSpeed;
  float mountainOne = ConcateTriangularWaves(amplitude, period, translateX + movement, translateY, seed, uv.x);
  col = mix(col, mountainColor, smoothstep(0.01, 0.01 + smoothing, mountainOne + funcOffset - uv.y));
}

void main() {
  vec2 uv = vUv;
  uv -= vec2(0.5);
  uv.x *= uResolution.x / uResolution.y;
  uv *= 5.0;

  vec3 col = mix(skyButton, skyColor, smoothstep(0.0, 1.5, uv.y));

  float totalMovementSpeed = 0.15;
  DrawMountain(totalMovementSpeed * 0.2, uv, col, 0.2, 0.12, -0.11, 1.25, 1.216, 1.0, vec3(0.2, 0.46, 0.65));
  DrawMountain(totalMovementSpeed * 0.5, uv, col, 0.16, 0.16, -0.12, 0.85, 0.0, 2.125, vec3(0.18, 0.36, 0.5));
  DrawMountain(totalMovementSpeed * 1.0, uv, col, 0.5, 0.08, -0.135, 0.4, -0.612, 52.125, vec3(0.1, 0.26, 0.3));

  float fieldMask = smoothstep(0.01, 0.01 + smoothing * 4.0, 0.1 - uv.y);
  vec3 fieldBaseColor = mix(fieldMid, fieldDark, smoothstep(-0.6, -1.4, uv.y));
  col = mix(col, fieldBaseColor, fieldMask);

  vec2 ogUv = vUv;
  ogUv.x *= uResolution.x / uResolution.y;

  DrawLotusField(ogUv, 0.0, vec2(0.51, -0.48), fieldMask, totalMovementSpeed, col, 90.0);
  totalMovementSpeed *= 1.1;
  DrawLotusField(ogUv, 6.621, vec2(0.51, -0.46), fieldMask, totalMovementSpeed, col, 50.0);
  totalMovementSpeed *= 1.1;
  DrawLotusField(ogUv, 7.23, vec2(0.51, -0.43), fieldMask, totalMovementSpeed, col, 29.0);
  totalMovementSpeed *= 1.1;
  DrawLotusField(ogUv, 12.6, vec2(0.51, -0.4), fieldMask, totalMovementSpeed, col, 22.0);
  totalMovementSpeed *= 1.1;
  DrawLotusField(ogUv, -7.21, vec2(0.51, -0.35), fieldMask, totalMovementSpeed, col, 15.0);

  fragColor = vec4(col, 1.0);
}
`;

const meshProgram = createProgram(meshVs, meshFs);
const bgProgram = createProgram(bgVs, bgFs);

const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  1, 1,
]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const sphere = createMeshBuffer(createSphere(0.7, 32, 16));
const torus = createMeshBuffer(createTorus(1.1, 0.3, 32, 16));
const ground = createMeshBuffer(createPlane(20));

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const a = -0.5 * t3 + t2 - 0.5 * t;
  const b = 1.5 * t3 - 2.5 * t2 + 1.0;
  const c = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const d = 0.5 * t3 - 0.5 * t2;
  return [
    p0[0] * a + p1[0] * b + p2[0] * c + p3[0] * d,
    p0[1] * a + p1[1] * b + p2[1] * c + p3[1] * d,
    p0[2] * a + p1[2] * b + p2[2] * c + p3[2] * d,
  ];
}

const cameraPoints = [
  [0, 2.5, 6],
  [4, 3, 2],
  [0, 2.2, -4],
  [-4, 2.6, -2],
  [0, 2.5, 6],
];

function getCameraPos(t) {
  const seg = Math.floor(t) % (cameraPoints.length - 3);
  const localT = t - Math.floor(t);
  return catmullRom(
    cameraPoints[seg],
    cameraPoints[seg + 1],
    cameraPoints[seg + 2],
    cameraPoints[seg + 3],
    localT
  );
}

function drawMesh(mesh, model, color, reflective, view, proj, cameraPos, lightDir) {
  gl.useProgram(meshProgram);
  gl.bindVertexArray(mesh.vao);

  const normalMat = mat4InverseTranspose3x3(model);
  gl.uniformMatrix4fv(gl.getUniformLocation(meshProgram, "uModel"), false, model);
  gl.uniformMatrix4fv(gl.getUniformLocation(meshProgram, "uView"), false, view);
  gl.uniformMatrix4fv(gl.getUniformLocation(meshProgram, "uProj"), false, proj);
  gl.uniformMatrix3fv(gl.getUniformLocation(meshProgram, "uNormal"), false, normalMat);
  gl.uniform3fv(gl.getUniformLocation(meshProgram, "uCameraPos"), cameraPos);
  gl.uniform3fv(gl.getUniformLocation(meshProgram, "uLightDir"), lightDir);
  gl.uniform3fv(gl.getUniformLocation(meshProgram, "uLightColor"), [1, 1, 1]);
  gl.uniform3fv(gl.getUniformLocation(meshProgram, "uBaseColor"), color);
  gl.uniform1f(gl.getUniformLocation(meshProgram, "uShininess"), 48.0);
  gl.uniform1f(gl.getUniformLocation(meshProgram, "uReflective"), reflective);

  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(null);
}

function shadowMatrix(plane, lightDir) {
  const [a, b, c, d] = plane;
  const [lx, ly, lz] = lightDir;
  const dot = a * lx + b * ly + c * lz;
  return [
    dot - lx * a, -lx * b, -lx * c, -lx * d,
    -ly * a, dot - ly * b, -ly * c, -ly * d,
    -lz * a, -lz * b, dot - lz * c, -lz * d,
    0, 0, 0, dot,
  ];
}

function render(time) {
  const t = time * 0.001;
  resize();

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.05, 0.07, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(bgProgram);
  gl.bindVertexArray(quadVao);
  gl.uniform2f(gl.getUniformLocation(bgProgram, "uResolution"), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(bgProgram, "uTime"), t);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  const cameraT = (t * 0.2) % (cameraPoints.length - 3);
  const cameraPos = getCameraPos(cameraT);
  const view = mat4LookAt(cameraPos, [0, 1.0, 0], [0, 1, 0]);
  const proj = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

  const lightDir = vec3Normalize([0.5, 1.0, 0.3]);

  const groundModel = mat4Identity();
  drawMesh(ground, groundModel, [0.2, 0.25, 0.3], 0.0, view, proj, cameraPos, lightDir);

  const sphereModel = mat4Multiply(mat4Translate(0, 1.0, 0), mat4Scale(1, 1, 1));
  drawMesh(sphere, sphereModel, [0.7, 0.8, 0.95], 1.0, view, proj, cameraPos, lightDir);

  const torusModel = mat4Multiply(mat4Translate(-2.0, 1.1, -1.5), mat4RotateY(t));
  drawMesh(torus, torusModel, [0.9, 0.4, 0.6], 0.0, view, proj, cameraPos, lightDir);

  // Projected shadows onto ground plane y=0
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const shadowMat = shadowMatrix([0, 1, 0, 0], lightDir);
  const shadowModelSphere = mat4Multiply(shadowMat, sphereModel);
  drawMesh(sphere, shadowModelSphere, [0.0, 0.0, 0.0], 0.0, view, proj, cameraPos, lightDir);
  const shadowModelTorus = mat4Multiply(shadowMat, torusModel);
  drawMesh(torus, shadowModelTorus, [0.0, 0.0, 0.0], 0.0, view, proj, cameraPos, lightDir);
  gl.disable(gl.BLEND);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

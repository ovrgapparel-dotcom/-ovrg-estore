// Global test setup for Vitest with happy-dom
// Comprehensive mock of CanvasRenderingContext2D
HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') {
    return {
      // Basic drawing methods (no‑ops)
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
      putImageData: () => {},
      createImageData: () => new Uint8ClampedArray(0),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      // Text measurement
      measureText: () => ({ width: 0 }),
      // Other utilities
      fillText: () => {},
    };
  }
  return null;
};

// Mock Image object to prevent loading errors
global.Image = class {
  constructor() {
    setTimeout(() => this.onload && this.onload(), 0);
  }
  set src(_) {}
};

// Mock XMLHttpRequest for any synchronous fetches
global.XMLHttpRequest = class {
  constructor() {
    this.headers = {};
    this.readyState = 4;
    this.status = 200;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  send() {
    setTimeout(() => {
      this.responseText = '';
      this.onload && this.onload();
    }, 0);
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  responseText = '';
};

// Mock fetch for any network request – return empty JS so script tags load harmlessly
global.fetch = async (url, init) => ({
  ok: true,
  text: async () => '',
  json: async () => ({}),
});

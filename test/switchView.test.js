// @vitest-environment happy-dom
// integration test for switchView handling sleeve-left and sleeve-right views
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';

let window, document;

beforeAll(() => {
  // happy-dom provides a global window and document automatically
  // Ensure globals are available
  // @ts-ignore
  window = global.window;
  // @ts-ignore
  document = global.document;
  // Load outerwear.html body content
  const outerwearHTML = fs.readFileSync('C:/Users/aut40nov19/.gemini/antigravity-ide/scratch/ovrg-estore/outerwear.html', 'utf-8');
  // Extract content inside <body>
  const bodyMatch = outerwearHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';
  document.body.innerHTML = bodyContent;

  // Load the application script that defines switchView and related globals
  const scriptPath = 'C:/Users/aut40nov19/.gemini/antigravity-ide/scratch/ovrg-estore/test_script_1.js';
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  (function(){ eval(scriptContent); }).call(global);
  global.switchView = global.switchView || global.window.switchView;
});

describe('switchView integration', () => {
  it('default view is front on page load', () => {
    // After beforeAll, the default should be front
    expect(document.getElementById('front-view')?.style.display).toBe('block');
    // Ensure other views are hidden
    expect(document.getElementById('back-view')?.style.display).toBe('none');
    expect(document.getElementById('sleeve-left-view')?.style.display).toBe('none');
    expect(document.getElementById('sleeve-right-view')?.style.display).toBe('none');
  });

  it('activates sleeve-left view correctly', () => {
    global.switchView('sleeve-left');
    expect(document.getElementById('sleeve-left-view')?.style.display).toBe('block');
    expect(document.getElementById('sleeve-right-view')?.style.display).toBe('none');
  });

  it('activates sleeve-right view correctly', () => {
    global.switchView('sleeve-right');
    expect(document.getElementById('sleeve-right-view')?.style.display).toBe('block');
    expect(document.getElementById('sleeve-left-view')?.style.display).toBe('none');
  });
});

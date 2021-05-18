/**
 * A javascript library that simulates a scratch off lottery ticket. It's responsive and is mobile friendly.
 *
 * @author Aaron Graham
 */
function ScratchIt() {
  let parentEl;
  let overlayCanvas;
  let overlayCtx;
  let brushCanvas;
  let brushCtx;
  let overlayLoaded = false;
  let brushLoaded = false;
  let isPointerDown = false;
  let pointerOrigin = { x: 0, y: 0 };
  let offsetOrigin = { x: 0, y: 0 };
  let scale = 1.0;
  const paintQueue = [];
  let lastPoint;
  let rafId;
  let minPointDist = 10;
  let isRevealed = false;
  let revealThreshold;
  let revealCallback;
  let loadedCallback;
  let downCallback;
  let upCallback;

  /**
   * Constructor
   *
   * @constructor
   * @param {DOMElement} el The parent DOM element that the canvas will be appended to
   * @param {String} overlayUrl The URL to the image which will be displayed
   * @param {String} brushUrl The URL to the image which will act as the brush for erasing the content of the overlay image
   * @param {Function} callback (Optional) A function to be called after a certain percentage of the overlay image has been removed.
   * @param {Number} threshold (Optional) A percentage between 0 and 100. This percentage of pixels must be visible to the user before the revealCallback will be triggered.
   * @throws {Exception} On any invalid argument
   * @return {void}
   */
  const construct = function (el, overlayUrl, brushUrl) {
    parentEl = el;

    const callback = arguments.length > 3 ? arguments[3] : function () {};
    const threshold = Math.max(0, Math.min(100, arguments.length > 4 ? arguments[4] * 1 : 0));

    loadedCallback = arguments.length > 5 ? arguments[5] : function () {};
    downCallback = arguments.length > 6 ? arguments[6] : function () {};
    upCallback = arguments.length > 7 ? arguments[7] : function () {};

    if (!isDomElement(parentEl)) {
      throw 'ScratchIt() requires parent element to be a valid DOM Element."';
    }
    if (typeof callback !== 'function') {
      throw 'ScratchIt() requires callback to be a function';
    }

    revealCallback = callback;
    revealThreshold = threshold;

    getCanvasFromImage(overlayUrl, (canvas) => {
      overlayLoaded = true;
      overlayCanvas = canvas;
      onCanvasLoaded();
    }, true);
    getCanvasFromImage(brushUrl, (canvas) => {
      brushLoaded = true;
      brushCanvas = canvas;
      onCanvasLoaded();
    });
  };

  /**
   * Tests whether something is a DOM Element
   *
   * @private
   * @param {Object} el
   * @returns {Boolean}
   */
  var isDomElement = function (el) {
    return typeof HTMLElement === 'object' ? el instanceof HTMLElement // DOM2
      : el && typeof el === 'object' && el !== null && el.nodeType === 1 && typeof el.nodeName === 'string';
  };

  /**
   * Event handler called after an image has been loaded into a canvas. Once all canvases are loaded,
   * the function initializes everything required for the scratchIt widget to work.
   *
   * @private
   * @return {void}
   */
  var onCanvasLoaded = function () {
    const { body } = document;

    // don't do any work until both brush and overlay have been attempted to be fetched
    if (!(overlayLoaded && brushLoaded)) {
      return;
    }

    // log error if either of them failed
    if (!(overlayCanvas && brushCanvas)) {
      console.error('Failed to load ScratchIt image');
      return;
    }

    // Build and initialize the widget
    parentEl.appendChild(overlayCanvas);

    overlayCtx = overlayCanvas.getContext('2d');
    brushCtx = brushCanvas.getContext('2d');

    overlayCtx.globalCompositeOperation = 'destination-out';
    minPointDist = brushCanvas.width / 2;

    if (window.PointerEvent) {
      overlayCanvas.addEventListener('pointerdown', onPointerDown);
      body.addEventListener('pointerup', onPointerUp);
      body.addEventListener('pointerleave', onPointerUp);
      body.addEventListener('pointermove', onPointerMove);
    } else {
      overlayCanvas.addEventListener('mousedown', onPointerDown);
      body.addEventListener('mouseup', onPointerUp);
      body.addEventListener('mouseleave', onPointerUp);
      body.addEventListener('mousemove', onPointerMove);

      overlayCanvas.addEventListener('touchstart', onPointerDown);
      body.addEventListener('touchend', onPointerUp);
      body.addEventListener('touchmove', onPointerMove);
    }

    window.addEventListener('resize', debounce(onResize, 200));

    onResize();

    rafId = window.requestAnimationFrame(draw);

    loadedCallback();
  };

  /**
   * This function is called by RAF and is responsible for painting to the canvas
   *
   * @private
   * @return {void}
   */
  var draw = function () {
    let point;
    while (paintQueue.length) {
      point = paintQueue.shift();
      overlayCtx.drawImage(brushCanvas, point.x - brushCanvas.width / 2, point.y - brushCanvas.height / 2);
    }

    rafId = window.requestAnimationFrame(draw);
  };

  /**
   * Returns a function, that, as long as it continues to be invoked, will not
   * be triggered. The function will be called after it stops being called for
   * N milliseconds.
   *
   * @private
   * @see http://davidwalsh.name/javascript-debounce-function
   * @param {Function} func The function to debounce.
   * @param {Number} wait The number of milliseconds after it stops being called.
   * @param {Bool} immediate If `immediate` is passed, trigger the function on the leading edge, instead of the trailing.
   * @returns {Function}
   */
  var debounce = function (func, wait, immediate) {
    let timeout;
    return function () {
      const context = this; const
        args = arguments;
      const later = function () {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  /**
   * Event handler called when the browser window is resized. Keeps track of the scale of the parent element
   * so pointer events can be scaled and drawn properly regardless of the element's size.
   *
   * @private
   * @return {void}
   */
  var onResize = function () {
    scale = 1 / (parentEl.getBoundingClientRect().width / overlayCanvas.width);
  };

  /**
   * Helper method for adding a new point to the queue of points which must be drawn to the overlay.
   *
   * @private
   * @param {Object} point The pre-scaled x,y coordinates to draw the brush
   * @param {Bool} tween Specifies whether additional points should be drawn between the last point. (in case pointer events are widely spread apart. cursor or finger is swiping fast)
   * @return {void}
   */
  const addPoint = function (point, tween) {
    let dx; let dy; let dist; let i; let
      numSegments;
    tween = !!tween;

    if (tween && lastPoint) {
      // calc distance between current and last point added
      dx = lastPoint.x - point.x;
      dy = lastPoint.y - point.y;
      dist = Math.sqrt(dx * dx + dy * dy);

      // if distance is too large, add points in between
      if (dist > minPointDist) {
        numSegments = Math.ceil(dist / minPointDist);
        dx /= numSegments;
        dy /= numSegments;

        for (i = 1; i < (numSegments); i++) {
          paintQueue.push({
            x: Math.round(point.x + (i * dx)),
            y: Math.round(point.y + (i * dy)),
          });
        }
      }
    }

    point = {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
    lastPoint = point;
    paintQueue.push(point);
  };

  /**
   * Utility method for canceling a browser event. Prevents default behavior and event bubbling.
   *
   * @private
   * @param {Event} event
   * @return {void}
   */
  const cancelEvent = function (event) {
    event.preventDefault();
    event.cancelBubble = true;
    event.stopPropagation();
  };

  /**
   * Event handler called when a user touches/clicks the overlay canvas.
   *
   * @private
   * @param {Event} event
   * @return {void}
   */
  var onPointerDown = function (event) {
    cancelEvent(event);

    isPointerDown = true;

    pointerOrigin = getPointFromEvent(event);
    offsetOrigin = getOffsetPointFromEvent(event);

    // alert('scale:'+scale+' vp:'+pointerOrigin.x+','+pointerOrigin.y+' off:'+offsetOrigin.x+','+offsetOrigin.y);

    addPoint({
      x: offsetOrigin.x * scale,
      y: offsetOrigin.y * scale,
    });

    downCallback();
  };

  /**
   * Event handler called when a user has started drawing/touching the canvas.
   *
   * @private
   * @param {Event} event
   * @return {void}
   */
  var onPointerMove = function (event) {
    if (!isPointerDown) { return; }
    cancelEvent(event);

    const pointerPosition = getPointFromEvent(event);
    addPoint({
      x: (offsetOrigin.x + (pointerPosition.x - pointerOrigin.x)) * scale,
      y: (offsetOrigin.y + (pointerPosition.y - pointerOrigin.y)) * scale,
    }, true);
  };

  /**
   * Event handler called when a user has released mouse click or removed finger from canvas.
   *
   * @private
   * @param {Event} event
   * @return {void}
   */
  var onPointerUp = function (event) {
    if (!isPointerDown) { return; }
    cancelEvent(event);

    isPointerDown = false;

    lastPoint = void (0);
    pointerOrigin = { x: 0, y: 0 };
    offsetOrigin = { x: 0, y: 0 };

    upCallback();
    testRevealed();
  };

  /**
   * Utility method that tests the percentage of pixels of the overlay image that have been revealed. A pixel is
   * considered revealed if it is more than 50% transparent. If a threshold is reached, the user's reveal callback
   * function is called once.
   *
   * @private
   * @return {void}
   */
  var testRevealed = function () {
    let pixels; let i;
    let numVisible = 0;
    const alphaThreshold = 128;
    const totalPixels = overlayCanvas.width * overlayCanvas.height;

    if (isRevealed) { return; }

    pixels = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
    for (i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i + 3] <= alphaThreshold) {
        numVisible++;
      }
    }

    if ((numVisible / totalPixels * 100) >= revealThreshold) {
      revealCallback();
      isRevealed = true;
    }
  };

  /**
   * This function returns an object with X & Y values from the pointer event
   *
   * @param {Event} event
   * @returns {Object} Contains mouse x,y coords
   */
  var getPointFromEvent = function (event) {
    return {
      x: (event.targetTouches ? event.targetTouches[0].clientX : event.clientX),
      y: (event.targetTouches ? event.targetTouches[0].clientY : event.clientY),
    };
  };

  /**
   * Utility method to get mouse coordinates relative to the element that captured the event.
   *
   * @param {Event} event The event object
   * @returns {Object} Contains mouse x,y coords
   */
  var getOffsetPointFromEvent = function (event) {
    let offsetX; let offsetY;
    const currentElement = event.target;
    const totalOffsetX = 0;
    const totalOffsetY = 0;

    if (typeof event.offsetX === 'number') {
      offsetX = event.offsetX;
      offsetY = event.offsetY;
    } else if (event.originalEvent && typeof event.originalEvent.layerX === 'number') {
      offsetX = event.oritinalEvent.layerX;
      offsetY = event.oritinalEvent.layerY;
    }
    // safari on iOS has no easy way to get the event coordinates relative to the canvas...
    else {
      const rect = overlayCanvas.getBoundingClientRect();
      // alert(rect.top+','+rect.left+','+rect.width+','+rect.height);
      /*
      do{
        totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
        totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
      }
      while(currentElement = currentElement.offsetParent)

      offsetX = event.pageX - totalOffsetX;
      offsetY = event.pageY - totalOffsetY;
      */
      offsetX = event.touches[0].clientX - rect.left;
      offsetY = event.touches[0].clientY - rect.top;
    }

    return { x: offsetX, y: offsetY };
  };

  /**
   * Tests whether the current browser is Internet Explorer 9
   *
   * @private
   * @returns {bool}
   */
  const isIE9 = function () {
    const av = navigator.appVersion;
    return (av.indexOf('MSIE') !== -1 && parseFloat(av.split('MSIE')[1]) <= 9);
  };

  const resizeParentEl = function (image) {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const ratio = h / w;

    const pw = document.body.clientWidth;
    const ph = document.body.clientHeight;

    const ratioX = pw / w;
    const ratioY = ph / h;

    if (ratioY < ratioX) {
      parentEl.style.height = ph + 'px';
      parentEl.style.width = (ph * ratio) + 'px';
    } else {
      parentEl.style.width = pw + 'px';
      parentEl.style.height = (pw * ratio) + 'px';
    }
  };

  /**
   * Loads an image into a canvas object
   *
   * @private
   * @param {string} imgUrl The source image URL. Remember that domain policies apply to working with
   *   images on canvas. The image may need to have appropriate CORS headers set or be served from the same
   *   domain as your application.
   * @param {function} callback
   * @return {void}
   */
  var getCanvasFromImage = function (imgUrl, callback, resize) {
    let image;

    // bailout if the user didn't supply a valid callback, image URL, the browser doesn't support
    // canvas or we are unable to return the canvas as the requested data uri string
    if (typeof imgUrl !== 'string' || typeof callback !== 'function') {
      callback(false);
      return;
    }

    image = new Image();

    image.onload = function () {
      if (resize) {
        resizeParentEl(image);
      }

      // IE9 needs a breather before it will reliably get the contents of the image to paint to the canvas
      if (isIE9()) {
        setTimeout(() => { callback(imageToCanvas(image)); }, 300);
      } else {
        callback(imageToCanvas(image));
      }
    };

    image.onerror = function () {
      callback(false);
    };

    if (!isSameOrigin(imgUrl)) {
      image.crossOrigin = '';
    }

    image.src = imgUrl;
  };

  /**
   * Tests whether a supplied URL shares the same origin (protocol and domain) as the current page.
   *
   * @private
   * @param {string} url The URL to test
   * @returns {bool}
   */
  var isSameOrigin = function (url) {
    const l = window.location;
    try {
      return ((new URL(url)).origin === l.origin);
    } catch (ex) {
      const a = document.createElement('A');
      let urlOrigin; let
        winOrigin;

      // attach an anchor tag to the document with the URL to test. this allows us to get access to the
      // various pieces that comprise the URL
      a.href = url;
      document.head.appendChild(a);
      a.href = a.href; // relative URL's seem to need a refresh here to properly get the URL pieces in IE

      // create normalized origins by stripping off a port number and forcing to lower case
      urlOrigin = (`${a.protocol}//${a.host}`).replace(/:\d+/, '').toLowerCase();
      winOrigin = (`${l.protocol}//${l.host}`).replace(/:\d+/, '').toLowerCase();

      // clean up the anchor tag
      document.head.removeChild(a);

      return urlOrigin === winOrigin;
    }
  };

  /**
   * Paints an image to a canvas
   *
   * @private
   * @param {object} img The source <img> DOM element
   * @param {function} callback Function to call after the image has been drawn to the canvas
   * @returns {void}
   */
  var imageToCanvas = function (img) {
    const canvas = document.createElement('CANVAS');
    const ctx = canvas.getContext('2d');
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  };

  construct.apply(this, arguments);
}

/**
* Tests whether the browser has the capabilties necessary to use this library. (requires canvas and RAF support)
*
* @public
* @static
* @return {Boolean}
*/
ScratchIt.isSupported = function () {
  const canvas = document.createElement('CANVAS');
  return !!(typeof window.requestAnimationFrame === 'function' && canvas.getContext && canvas.getContext('2d'));
};

module.exports = ScratchIt;

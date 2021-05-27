import PandaBridge from 'pandasuite-bridge';

const ScratchIt = require('./ScratchIt');

let properties = null;

function reveal() {
  if (properties.hideOnRevealed) {
    document.getElementById('scratch').className += ' revealed';

    /* NOTE: really weird workaround to force Edge 16 to actually detect the css class name
      addition and render the fade out transition.
      getElementById doesn't work, it actually needs to be getElementsByTagName.
      Any style could be changed (like fontSize) to trigger the update */
    if (window.navigator.userAgent.indexOf('Edge') > -1) {
      document.getElementsByTagName('canvas')[0].style.width = '100%';
    }
  }
  PandaBridge.send(PandaBridge.UPDATED, {
    queryable: {
      revealed: true,
    },
  });
  PandaBridge.send('revealed');
}

function myInit() {
  if (ScratchIt.isSupported()) {
    ScratchIt(
      document.getElementById('scratch'),
      PandaBridge.resolvePath('overlayImgUrl'),
      PandaBridge.resolvePath('brushImgUrl', 'images/brush.png'),
      reveal,
      properties.revealPercent,
      properties.brushSize,
      () => {
        PandaBridge.send('onLoaded');
      },
      () => {
        PandaBridge.send('onStartScratching');
      },
      () => {
        PandaBridge.send('onEndScratching');
      },
    );
  } else {
    PandaBridge.send('notSupported');
  }
}

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;

    if (document.readyState === 'complete') {
      myInit();
    } else {
      document.addEventListener('DOMContentLoaded', myInit, false);
    }
  });

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;
  });

  /* Actions */

  PandaBridge.listen('reveal', reveal);
});

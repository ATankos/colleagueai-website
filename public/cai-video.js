/* cai-video.js: behaviour for the site's video players (markup: scripts/lib/videos.cjs).
 *
 * - Nothing loads before interaction: the <video> element is cloned from an inert <template> when the visitor
 *   presses play. No autoplay before that click, and never with sound on page load.
 * - Subtitles are drawn as text in the caption bar below the picture (no overlap with captions burned into the
 *   master). Text is set with textContent only.
 * - Full screen covers the picture and the caption bar together; where only the native player can go full screen
 *   (iPhone), the native control is used.
 * - Starting one video pauses any other on the page.
 * - No cookies, no storage, no network requests other than the video and the caption file chosen.
 */
(function () {
  'use strict';

  function setup(fig) {
    var facade = fig.querySelector('[data-cai-video-play]');
    var tpl = fig.querySelector('template[data-cai-video-tpl]');
    var select = fig.querySelector('[data-cai-video-cc-select]');
    var bar = fig.querySelector('[data-cai-video-cc]');
    var fsButton = fig.querySelector('[data-cai-video-fs]');
    var frame = fig.querySelector('.cai-video__frame');
    var video = null;
    if (!facade || !tpl || !select || !bar || !frame) return;

    function chosen() {
      if (!video || select.value === 'off') return null;
      for (var i = 0; i < video.textTracks.length; i += 1) {
        if (video.textTracks[i].language === select.value) return video.textTracks[i];
      }
      return null;
    }

    function draw() {
      var track = chosen();
      if (!track) { bar.hidden = true; bar.textContent = ''; return; }
      var lines = [];
      var active = track.activeCues;
      for (var i = 0; active && i < active.length; i += 1) lines.push(active[i].text);
      bar.hidden = false;
      bar.textContent = lines.join('\n');
    }

    function applyTracks() {
      if (!video) return;
      for (var i = 0; i < video.textTracks.length; i += 1) {
        var tr = video.textTracks[i];
        tr.mode = select.value !== 'off' && tr.language === select.value ? 'hidden' : 'disabled';
      }
      draw();
    }

    function start() {
      if (video) return video;
      var node = tpl.content.firstElementChild.cloneNode(true);
      facade.parentNode.replaceChild(node, facade);
      video = node;
      for (var i = 0; i < video.textTracks.length; i += 1) video.textTracks[i].addEventListener('cuechange', draw);
      video.addEventListener('play', function () {
        var others = document.querySelectorAll('figure.cai-video video');
        for (var j = 0; j < others.length; j += 1) if (others[j] !== video) others[j].pause();
      });
      applyTracks();
      return video;
    }

    facade.addEventListener('click', function () {
      var v = start();
      v.focus();
      var played = v.play();
      if (played && typeof played.catch === 'function') played.catch(function () { /* the visitor can press play */ });
    });

    select.addEventListener('change', applyTracks);

    if (fsButton) {
      var canFrame = Boolean(frame.requestFullscreen || frame.webkitRequestFullscreen);
      fsButton.addEventListener('click', function () {
        var v = start();
        var current = document.fullscreenElement || document.webkitFullscreenElement;
        if (current) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else if (canFrame) {
          var req = frame.requestFullscreen || frame.webkitRequestFullscreen;
          var r = req.call(frame);
          if (r && typeof r.catch === 'function') r.catch(function () {});
        } else if (v.webkitEnterFullscreen) {
          v.webkitEnterFullscreen();
        }
      });
      var sync = function () {
        var on = (document.fullscreenElement || document.webkitFullscreenElement) === frame;
        fsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
      fsButton.setAttribute('aria-pressed', 'false');
    }
  }

  var figs = document.querySelectorAll('figure.cai-video[data-cai-video]');
  for (var k = 0; k < figs.length; k += 1) setup(figs[k]);
})();

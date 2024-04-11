/* imports common modules */

var electron = require('electron')
var ipc = electron.ipcRenderer

var propertiesToClone = ['deltaX', 'deltaY', 'metaKey', 'ctrlKey', 'defaultPrevented', 'clientX', 'clientY']
function cloneEvent (e) {
  var obj = {}

  for (var i = 0; i < propertiesToClone.length; i++) {
    obj[propertiesToClone[i]] = e[propertiesToClone[i]]
  }
  return JSON.stringify(obj)
}

// workaround for Electron bug
setTimeout(function () {
  /* Used for swipe gestures */
  window.addEventListener('wheel', function (e) {
    ipc.send('wheel-event', cloneEvent(e))
  })

  var scrollTimeout = null

  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(function () {
      ipc.send('scroll-position-change', Math.round(window.scrollY))
    }, 200)
  })
}, 0)

/* Used for picture in picture item in context menu */
ipc.on('getContextMenuData', function (event, data) {
  // check for video element to show picture-in-picture menu
  var hasVideo = Array.from(document.elementsFromPoint(data.x, data.y)).some(el => el.tagName === 'VIDEO')
  ipc.send('contextMenuData', { hasVideo })
})

ipc.on('enterPictureInPicture', function (event, data) {
  var videos = Array.from(document.elementsFromPoint(data.x, data.y)).filter(el => el.tagName === 'VIDEO')
  if (videos[0]) {
    videos[0].requestPictureInPicture()
  }
})

var autoPlayUtube = true
const disableUPlayer = async () => {
  if(!autoPlayUtube) return // Already disabled
  const videoPlayer = window.document.getElementById("player")
  if(!videoPlayer) { setTimeout(disableUPlayer, 100); return } // Wait for the player to load, will try again after 100 ms
  const videoTag = videoPlayer.getElementsByClassName("html5-main-video")[0] // Youtube's Main <video>
  const playButton = videoPlayer.getElementsByClassName("ytp-play-button")[0] // Youtube's Play Button
  const bigPlayButton = window.document.getElementsByClassName("ytp-large-play-button ytp-button")[0]
  const autoPause = () => { if(!videoTag.paused) videoTag.pause() } 
  const removeAutoPause = () => { 
      ipc.send('youtube-main', {type: "player", task: "pause"}) // Send pause => main => youtube-service => pause our player
      videoTag.play()
      videoTag.removeEventListener("canplay", autoPause)
      videoTag.removeEventListener("play", autoPause)
      autoPlayUtube = true
      playButton.removeEventListener("click", removeAutoPause)
      bigPlayButton.removeEventListener("click", removeAutoPause)
  }
  setTimeout(() => { // This will run after 100ms, to have a higher probability that the youtube video tag is loaded
    if(!videoTag) { disableUPlayer(); return } // if not, will try again after 100 ms
    autoPause() // Pause the video
    videoTag.addEventListener("canplay", autoPause)
    videoTag.addEventListener("play", autoPause)
    playButton.addEventListener("click", removeAutoPause)
    bigPlayButton.addEventListener("click", removeAutoPause)
    autoPlayUtube = false
  }, 100)
}

ipc.on('youtube', function (event, data) { // Reciever from main process.
  console.log('RECIEVED FROM IPC ====> Youtube =====>', data)
  const { status } = data
  if(status === "playing"){
    disableUPlayer()
  }
  // handle youtube service failure
  // handle toggle of youtube premium music.
})

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }

  if (e.data?.message === 'showCredentialList') {
    ipc.send('showCredentialList')
  }

  if (e.data?.message === 'showUserscriptDirectory') {
    ipc.send('showUserscriptDirectory')
  }

  if (e.data?.message === 'downloadFile') {
    ipc.send('downloadFile', e.data.url)
  }
})
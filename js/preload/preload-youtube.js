let curYTHash = null
let tabId = null
const downloadInfoCache = {}

const RETRY_INTERVAL = 500
const ytIds = {
  player: "#player",
  innerPlayer: "#ytd-player",
  video: ".html5-main-video",  // Youtube's Main <video> tag
  playButton: ".ytp-play-button", // Youtube's Play Button
  bigPlayButton: ".ytp-large-play-button.ytp-button", // Youtube's Big Play Button in the center of the video
  logo: '[id^="yt-logo-updated-svg"]'
}

const addLogoToPopUp = () => {
    const logo = document.querySelector(ytIds.logo)
    if(!logo) { setTimeout(addLogoToPopUp, RETRY_INTERVAL); return }
    const ytLogoSVG = logo.cloneNode(true);
    document.querySelector(".youtube-svg").appendChild(ytLogoSVG);
}

const addPopup = () => {
    var existingPopup = document.querySelector('.popup-container');
    if (existingPopup) return
    const popupStyles = document.createElement('style');
    popupStyles.textContent = `
        .popup-container {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #202124;
            padding: 20px;
            border-radius: 10px;
            width: 400px;
            z-index: 1000;
            color: white;
            display: none;
        }
        .youtube-svg {
            fill: #FFFFFF;
            width: 100px;
        }
        .popup-header {
            display: flex;
        }
        .popup-title {
            font-size: 24px;
            font-weight: bold;
            padding-left: 5px;
        }
        .options-container {
            padding: 20px 0px;
        }
        .option {
            padding: 10px 0px;
            color: #FFFFFF;
            font-size: 14px;
            display: flex;
        }
        .option input {
            cursor: pointer;
            transform: scale(1.5);
        }
        .option label {
            cursor: pointer;
            margin-left: 10px;
        }
        .option-radio {
            display: flex;
            align-items: center;
            width: max-content;
        }
        .option-info {
            margin-left: auto;
        }
        .option-sub-text{
            font-size: 10px;
            color: #b1b1b1;
            padding-top: 2px;
        }
        .button-container {
            display: flex;
            justify-content: flex-end;
        }
        .popup-button {
            background-color: #606060;
            border: none;
            padding: 8px 20px;
            border-radius: 5px;
            cursor: pointer;
            color: white;
        }
        .primary-button {
            background-color: #FF0000;
            margin-left: 10px;
        }
        .main-button {
            background: #2b2929;
            position: absolute;
            right: 0px;
            z-index: 100;
            bottom: -35px;
            border: 2px solid red;
            border-radius: 20px;
            font-weight: bold;
        }
        .special-format-text {
            background: red;
            padding: 0px 5px;
            font-weight: bold;
            border-radius: 2px;
            font-size: 12px;
        }
    `;
    document.head.appendChild(popupStyles);
    const popup = document.createElement('div');
    popup.innerHTML = `
        <div class="popup-container">
            <div class="popup-header" id="popupHeader">
                <div class="youtube-svg"></div>
                <div class="popup-title">Premium - by Oxy ^.-</div>
            </div>
            <div id="qualityOptions" class="options-container">
            </div>
            <div class="button-container">
                <button id="closeBtn" class="popup-button">Close</button>
                <button id="downloadBtn" class="popup-button primary-button">Download</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    addLogoToPopUp();
    // Add Event Listeners
    const closeBtn = document.getElementById('closeBtn')
    const downloadBtn = document.getElementById('downloadBtn')

    closeBtn.addEventListener('click', function() {
        document.querySelector('.popup-container').style.display = 'none';
    });
    downloadBtn.addEventListener('click', function() {
        var selectedOption = popup.querySelector('input[name="quality"]:checked').value;
        ipc.send('youtube-main', {
            type: "forward-service", task: "download-video", tab: tabId, 
            downloadInfo: downloadInfoCache[curYTHash], quality: selectedOption
        })
        closeBtn.click();
    });
}

const formatDetails = {
    4320: "Ultra HD",
    2160: "Ultra HD",
    1440: "Quad HD",
    1080: "Full HD", 
    720: "HD",
    480: "SD",
}

const specialFormats = {
    4320: " <span class='special-format-text'>8K</span>",
    2160: " <span class='special-format-text'>4K</span>",
}


const showDownloadOptions = (downloadInfoData, loader = false) => {
    if(loader) {
        document.getElementById('qualityOptions').innerHTML = 'Loading....';
        document.querySelector('.popup-container').style.display = 'block';
        return
    }
    const { info, formats, id } = downloadInfoData
    const qualityOptionsHTML = formats.map(option => `
        <div class="option">
            <div class="option-radio">
                <input type="radio" id="${option.id}" name="quality" value="${option.id}" />
                <label for="${option.id}">
                    <div>${option.h}p${specialFormats[option.h] ? specialFormats[option.h]: ''}</div>
                    <div class="option-sub-text">${option.w}x${option.h} ${formatDetails[option.h] ? '- ' + formatDetails[option.h]: ''}</div>
                </label>
            </div>
            <div class="option-info">
                <div style="text-align: right;">${(option.approx ? "~ ":"") + (option.size > 1024 ? (option.size / 1024).toFixed(2) + " GB": (option.size + " MB"))}</div>
                <div class="option-sub-text">Codec: ${option.vcodec}, VRB: ${option.vbr.toFixed(0)} KB/s</div>
            </div>
        </div>
    `).join('');
    document.getElementById('qualityOptions').innerHTML = qualityOptionsHTML;
    document.querySelector('.popup-container').style.display = 'block';
}

var downloadBtnAdded = false;
const addDownloadButton = () => {
    if(downloadBtnAdded) return;
    const videoPlayer = document.querySelector(ytIds.innerPlayer)
    if(!videoPlayer) { setTimeout(addDownloadButton, RETRY_INTERVAL); return } // Wait for the player to load, will try again after 100 ms
    const downloadButton = document.createElement('div');
    downloadButton.innerHTML = '<button id="mainDownloadBtn" class="popup-button main-button">Download</button>'
    videoPlayer.appendChild(downloadButton);
    downloadButton.addEventListener('click', () => {
        const data = downloadInfoCache[curYTHash]
        if(data) { showDownloadOptions(data); return;}
        ipc.send('youtube-main', {type: "forward-service", task: "yt-info", tab: tabId, ytHash: curYTHash}) // Send pause => main => yt-service => pause our player
        showDownloadOptions(null, true)
    })
    downloadBtnAdded = true
    addPopup();
}

var autoPauseUtube = false
const addAutoPause = async () => {
    if(autoPauseUtube) return // Already enabled
    const videoPlayer = document.querySelector(ytIds.innerPlayer)
    const videoTag = videoPlayer ? videoPlayer.querySelector(ytIds.video) : null
    if(!videoPlayer || !videoTag) { setTimeout(addAutoPause, RETRY_INTERVAL); return } // Wait for the player to load, will try again after 200 ms
    const playButton = videoPlayer.querySelector(ytIds.playButton) 
    const bigPlayButton = document.querySelector(ytIds.bigPlayButton)
    const autoPause = () => { if(!videoTag.paused) videoTag.pause() } 
    const removeAutoPause = () => { 
        ipc.send('youtube-main', {type: "forward-service", task: "pause"}) // Send pause => main => yt-service => pause our player
        videoTag.play();
        ["canplay", "play"].forEach(e => videoTag.removeEventListener(e, autoPause));
        [playButton, bigPlayButton].forEach(o => o.removeEventListener("click", removeAutoPause));
        autoPauseUtube = false
    }
    autoPause(); // Pause the video
    ["canplay", "play"].forEach(e => videoTag.addEventListener(e, autoPause));
    [playButton, bigPlayButton].forEach(o => o.addEventListener("click", removeAutoPause));
    autoPauseUtube = true
}
ipc.on('yt-browser', function (event, data) { // Reciever from main process.
  const { task, ytHash, tab } = data
  if(ytHash) curYTHash = ytHash
  if(tab) tabId = tab
  try {
    if(task === "enable-download") addDownloadButton()
    if(task === "enable-auto-pause") addAutoPause()
    if(task === "show-download-info") {
        downloadInfoCache[curYTHash] = data
        showDownloadOptions(data)
    }
  }catch(e) {
    console.error("Error in yt-browser ipc reciever", e)
  }
  // handle youtube service failure
  // handle toggle of youtube premium music.
})
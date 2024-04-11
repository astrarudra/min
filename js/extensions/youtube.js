const { exec } = require('child_process');
const webviews = require('../webviews.js')
const os = require('os');
const homeDir = os.homedir();
const YOUTUBE_SAVE_PATH = `${homeDir}/Downloads/youtube`;
const utubeState = {
    downloaded: {},
    progress: {},
}

const howlState = {
    howls: {},
    playing: null
}

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function createPlayer() {
    const playerDiv = document.getElementById('music-player');
    const titleDiv = document.getElementById('title');
    const playBtn = document.getElementById('playPauseButton');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const seeker = document.getElementById('seekSlider');
    const messageDiv = document.getElementById('message');
    const timmerDiv =  document.getElementById('player-timer');
    const timeDiv = document.getElementById('currentTime');
    const duration = document.getElementById('totalTime');

    let display = false;
    let playing = false;

    const open = () => {
        if(display) return
        display = true
        playerDiv.style.display = 'block'
        webviews.adjustMargin([0, 0, 60, 0])
    };
    const close = () => {
        if(!display) return
        display = false
        playerDiv.style.display = 'none'
        webviews.adjustMargin([0, 0, -60, 0])
    };
    let msgTimeout = null;
    let hideTimeout = null;
    const showMessage = (message, type = "success", persist = false) => {
        console.log("showMessage: ", message, type, persist)
        open();
        messageDiv.innerHTML = message;
        messageDiv.style.opacity = 1;
        messageDiv.className = `show ${type}-bg`
        clearTimeout(msgTimeout);
        clearTimeout(hideTimeout);
        if (persist) return
        msgTimeout = setTimeout(() => {
            messageDiv.style.opacity = 0;
            hideTimeout = setTimeout(() => { messageDiv.className = `hide`}, 300); // hide after 300ms for transition effect
        }, 3000);
    };
    let seekerInterval = null;
    const keepSeekerInSync = () => {
        releaseSync()
        const howl = howlState.playing
        if(!howl) {
            console.log("NO HOWL AT SYNC ----> DEBUG")
            return
        }
        const duration = howl.duration()
        seekerInterval = setInterval(() => {

            seeker.value = howl.seek() * 10000 / duration; // Update seeker position
            timeDiv.textContent = formatTime(howl.seek()); // Update current time
        }, 1000); // Update every 100 milliseconds
        console.log("INTERVAL: ", seekerInterval)
    };
    const releaseSync = () => {
        clearInterval(seekerInterval);
        seekerInterval = null;
    };
    const play = () => {
        if(playing) {
            console.log("ALREADY PLAYING", howlState.playing)
            return
        }
        const howl = howlState.playing
        if(!howl) {
            console.log("NO HOWL AT PLAY ----> DEBUG")
            return
        }
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        playing = true;
        keepSeekerInSync();
        howl.play();
    };
    const pause = () => {
        if(!playing) {
            console.log("ALREADY PAUSED", howlState.playing)
            return
        }
        const howl = howlState.playing
        console.log("TRIGGERED PAUSE:", howl)
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        playing = false;
        releaseSync();
        howl.pause();
    };
    const seek = (seekPercent) => { // seekPercent is a value between 0 and 10,000 (x100 for more accuracy)
        releaseSync()
        const howl = howlState.playing
        console.log(howl)
        const time = seekPercent / 10000 * howl.duration()
        howl.seek(time)
        timeDiv.textContent = formatTime(time);
        if(playing) keepSeekerInSync();
    };
    const end = () => {
        console.log("END TRIGGERED")
        const howl = howlState.playing;
        pause();
        seek(0);
    };
    const load = (title) => {
        console.log("PLAYER LOAD TRIGGERED")
        releaseSync()
        const howl = howlState.playing
        duration.textContent = formatTime(howl.duration());
        titleDiv.textContent = title;

    };
    const init = () => {
        playerDiv.addEventListener("mouseover", (event) => {
            console.log("MOUSE OVER", timmerDiv)
            seeker.className = 'slider active';
            timmerDiv.style.opacity = 0.8;
        });
        playerDiv.addEventListener("mouseout", (event) => {
            seeker.className = 'slider inactive';
            timmerDiv.style.opacity = 0
        });
        playBtn.addEventListener('click', function() {
            console.log("PLAY BTN CLICKED")
            if (playing) pause();
            else play();
        });
        seeker.addEventListener('input', function(e) {
            seek(parseFloat(e.target.value));
        })
    };

    return { playing, open, close, showMessage, play, pause, seek, end, load, init };
}

const player = createPlayer();
player.init()

const getExistingUtube = (directoryPath) => {
    try {
        const files = fs.readdirSync(directoryPath);
        const filteredFiles = files.filter(file => {
            const parts = file.split('.');
            return parts.length >= 2;
        });

        const yHashPaths = filteredFiles.reduce((acc, file) => {
            const parts = file.split('.');
            acc[parts[parts.length - 2]] = file;
            return acc
        }, {});
        return yHashPaths;
    } catch (err) {
        console.error('Error reading directory:', err);
        return {};
    }
}

async function ytDlpDownload(youtubeHash) {
    try {
        await new Promise((resolve, reject) => {
            exec(`yt-dlp -x -o "${YOUTUBE_SAVE_PATH}/%(title)s.%(id)s.%(ext)s" ${youtubeHash}`, async (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`Downloaded YouTube audio for ${youtubeHash}`);
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(error);
    }
}

const syncUtubeCache = () => utubeState.downloaded = getExistingUtube(YOUTUBE_SAVE_PATH)

const uTubeDownload = async (hash) => {
    try{ 
        await ytDlpDownload(hash)
        syncUtubeCache()
    } catch (error) {
        console.error(error);
    }
}

const createHowl = (path, ext) => {
    return new Promise((resolve, reject) => {
        const howl = new Howl({
            src: [path],
            format: [ext],
            html5: true, // Force to HTML5 so that the audio can stream in (best for large files).
            onload: () => {
                console.log('loaded - ', path);
                resolve(howl)
            },
            onend: player.end,
            onloaderror: function(id, error) { console.log('loadError: ' + id +' - ' + error); reject(error)}, // need to handle this
        });

    })
}

const getHowl = async (fileName) => {
    console.log("getHowl: ", fileName)
    if(howlState.howls[fileName]) return howlState.howls[fileName]
    const ext = fileName.split('.').pop()
    const data = fs.readFileSync(`${YOUTUBE_SAVE_PATH}/${fileName}`);
    let blob = new Blob([data]);
    const URI = URL.createObjectURL(blob)
    const howl = await createHowl(URI, ext)
    howlState.howls[fileName] = howl
    return howl
}

const play = async (fileName) => {
    player.open()
    console.log("MAIN-PLAY TRIGGERED: ", howlState.playing, howlState.howls, fileName)
    const howl = await getHowl(fileName)
    if(howlState.playing) {
        if(howlState.playing === howl) {
            player.showMessage("Playing")
            console.log("This is already playing so skipping play")
            return
        }
        player.pause()
        howlState.playing.stop()
        howlState.playing = null
        console.log("STOPPED: ", howlState.playing)
    }
    howlState.playing = howl
    const fileNameOnly = fileName.split('.').slice(0, -2).join('.')
    player.load(fileNameOnly)
    player.showMessage("Playing")
    player.play()
}

ipc.on('youtube-service', function (e, data) {
    const { task, youtubeHash } = data;
    if(task === "init") syncUtubeCache()
    else if(task === "play") {
        player.showMessage("Loading...", "warning", true)
        const fileName = utubeState.downloaded[youtubeHash];
        if(!fileName) { // download and then play
            player.showMessage("Downloading...", "warning", true)
            if(utubeState.progress[youtubeHash]) return // need to handle this better
            utubeState.progress[youtubeHash] = true
            uTubeDownload(youtubeHash).then(() => {
                delete utubeState.progress[youtubeHash]
                play(utubeState.downloaded[youtubeHash])
            })
        }
        else play(fileName)
    }
    else if(task === "pause") player.pause()
})
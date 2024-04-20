const { exec, spawn } = require('child_process');
const webviews = require('../webviews.js')
const os = require('os');
const homeDir = os.homedir();
const YOUTUBE_SAVE_PATH = `${homeDir}/Downloads/youtube`;
const YTDLP = 'yt-dlp'

const runYTDlp = (options, stdout, end) => {
    const ytProcess = spawn(YTDLP, options);
    ytProcess.stdout.on('data', stdout);
    ytProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    ytProcess.on('close', end);
    return ytProcess
}

const parseYTMsg = (output) => {
    const basicPatten = /\[(\w+)\]\s+(.+)/;
    const matches = output.match(basicPatten);
    return matches ? { type: matches[1], message: matches[2] } : { type: null, message: null }
}

function parseProgressInfo(data) {
    let { type } = data
    if(type === "downloading") return data;
    // else if(type === "error") return null;
    else if(type === "info") {
        const { type, message } = parseYTMsg(data.message)
        if(!type) {
            console.log("NO TYPE FOUND: ", data)
            return null
        }
        if(["youtube", "hlsnative", "info", "Merger"].includes(type)) return { type: "info", message}
        else{
            console.log("NEED TO PARSE THIS: ", type)
            console.log("YT-MESSAGE: ", message)
        }
    }
    return null
}

const utubeState = {
    downloaded: {},
    progress: {},
    videoProgress: {},
    videoDownloaded: {},
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

const createProgressDiv = (id) => {
    const content = `
        <div class="progress-container" id="progress-${id}">
            <div class="progress-bar" style="width: 0%;"></div>
            <div class="bar-overlay">
            <div class="title"></div>
            <div class="pct">0%</div>
            <div class="info">
                Download Initilizing...
            </div>
            <div class="close-icon">&#10006;</div>
            </div>
        </div>`
    const div = document.createElement('div');
    div.innerHTML = content;
    return div.children[0];
}

const createYTDownloaderUI = (id) => {
    const progressDiv = createProgressDiv(id);
    const titleDiv = progressDiv.querySelector('.title');
    const pctDiv = progressDiv.querySelector('.pct');
    const infoDiv = progressDiv.querySelector('.info');
    const closeIcon = progressDiv.querySelector('.close-icon');
    const progressBar = progressDiv.querySelector('.progress-bar');
    let lastPct = 0;
    const setTitle = (title) => {
        titleDiv.textContent = title;
    }
    const update = (info) => {
        if(!info) return
        const { type, message } = info;
        if(type === "info") {
            infoDiv.textContent = message;
            return
        }
        if(type !== "downloading") return
        let { pct, size, speed, eta } = message;
        pct = parseInt(pct);
        const diff = pct - lastPct;
        if(diff <= 0 && diff >= -5) return // ignore small neg changes in progress
        lastPct = pct;
        pct = `${pct}%`
        progressBar.style.width = pct
        pctDiv.textContent = pct
        infoDiv.textContent = `ETA: ${eta} | Speed: ${speed} | Size: ${size}`; //  ${cF ? `| Frags: ${cF}/${tF} `: ""}
    }
    const remove = () => {
        progressDiv.remove();
    }
    const init = (title, onClose) => {
        setTitle(title);
        closeIcon.addEventListener('click', onClose);
    }
    return { element: progressDiv, init, setTitle, update, remove };
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

const createYTDownloadManager = () => {
    const downloadManagerDiv = document.getElementById('yt-download-container');
    let count = 0
    const adjust = () => {
        const currCount = Object.keys(utubeState.videoProgress).length
        const diff = currCount - count
        if(diff === 0) return
        webviews.adjustMargin([0, 0, diff * 20, 0])
        count = currCount
    }
    const add = (id) => {
        const { ui } = utubeState.videoProgress[id]
        downloadManagerDiv.appendChild(ui.element);
        adjust()
    }
    const remove = (id) => {
        const { ui } = utubeState.videoProgress[id]
        ui.remove()
        const { startTime } = utubeState.videoProgress[id]
        const endTime = Date.now()
        console.log(`TIME TAKEN for ${id}: `, (endTime - startTime) / 1000)
        delete utubeState.videoProgress[id]
        adjust()
    }
    return { add, remove }
}
const ytDownloadManager = createYTDownloadManager()


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

async function ytDownloadMusic(ytHash) {
    try {
        await new Promise((resolve, reject) => {
            const options = '--audio-format mp3 --embed-thumbnail --convert-thumbnails jpg --embed-metadata'
            exec(`yt-dlp -x -o "${YOUTUBE_SAVE_PATH}/%(title)s.%(id)s.%(ext)s" ${ytHash} ${options}`, async (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`Downloaded YouTube audio for ${ytHash}`);
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(error);
    }
}

const filterYTVideoFormats = (info) => {
    const { formats, requested_formats } = info
    let bestAudio = requested_formats.find(o => o.vcodec === "none") 
    const filteredFormats = Object.values(formats.reduce((acc, curr) => {
        if(!curr.height || curr.height < 480 || curr.format_note === "Premium") return acc
        curr.vcodec = curr.vcodec.split('.')[0]
        const selected = acc[curr.height]
        if(selected){
            if(selected.size && !curr.filesize){
                curr.filesize = (selected.size / selected.vbr) * curr.vbr
                curr.approx = true
            }
        }
        const { height, width, filesize, vbr, resolution, approx, audio_channels, format_id, vcodec } = curr
        acc[curr.height] =  {
            id: format_id, h: height, w: width, res: resolution, size: filesize, 
            approx, vbr, vcodec,
            hasAudio: !!audio_channels,
        }
        return acc;
    }, {}));
    filteredFormats.forEach(o => {
        o.size = parseFloat((( !o.hasAudio ? (o.size + bestAudio.filesize) : o.size) / 1048576).toFixed(0))
    })

    const { id, title, acodec, aspect_ratio, asr, audio_channels, duration_string, fps, language } = info
    const response = {
        id,
        formats: filteredFormats.sort((a, b) => b.h - a.h),
        info: {
            title,
            aid: bestAudio.format_id,
            acodec, asr, fps, language,
            ratio: aspect_ratio,
            audioChannels: audio_channels,
            duration: duration_string,
        },
    }
    return response
}

const ytDetails = (ytHash) => {
    return new Promise((resolve, reject) => {
        console.log("INPUT YT-INFO: ", ytHash)
        exec(`yt-dlp -j ${ytHash} -S quality,res,fps,hdr:12,source,vcodec:av1` , (error, stdout, stderr) => {
            try {
                const info = JSON.parse(stdout);
                resolve(info);
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError);
                reject(parseError);
            }
        })
    })
}

const syncYTCache = () => utubeState.downloaded = getExistingUtube(YOUTUBE_SAVE_PATH)

const ytDownloadMusicAndSync = async (hash) => {
    try{ 
        await ytDownloadMusic(hash)
        syncYTCache()
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

const ytStdoutProgressToJson = (stdout) => {
    stdout = stdout.toString()
    // console.log("STDOUT[0]: ", "X"+stdout[0]+"X"+stdout[1]+"X", "X"+stdout[2]+"X")
    if(stdout[1] !== "{") return { type: "info", message: stdout} // not a json
    try {
        const j = JSON.parse(stdout);
        if(j.status !== 'downloading') return { type: "info", message: "Completed"}
        return {
            type: "downloading",
            message: {
                pct: j._percent_str.trim(),
                eta: j._eta_str.trim(),
                speed: j._speed_str.trim(),
                size: j._total_bytes_str.trim(),
            }
        } 
    } catch (error) {
        console.error("ERROR IN PROGRESS JSON PARSE: ", error, " RAW: ", stdout)
        return { type: "error", message: error, raw: stdout}
    }
}

const ytDownloadVideo = (youtubeHash, format, h, onProgress, onEnd) => {
    console.log("YT-DOWNLOAD-VIDEO: ", youtubeHash, format, h)
    const process = runYTDlp([
        youtubeHash,
        "--progress-template", "%(progress.{status,_eta_str,_speed_str,_total_bytes_str,_percent_str})j",
        '-f', format,
        '-N', 4,
        '-o', `${YOUTUBE_SAVE_PATH}/video/%(title)s.${h + "p"}.%(id)s.%(ext)s`,
        '--embed-metadata',
        '--embed-thumbnail',
        '--convert-thumbnails', 'jpg',
        '--merge-output-format', 'mkv',
    ], (stdout) => onProgress(ytStdoutProgressToJson(stdout)), onEnd)
    return process
}

const ytDownloadVideoAndSync = (downloadInfo, quality) => {
    const { id, info, formats } = downloadInfo
    const format = formats.find(o => o.id === quality)
    let ytFormat = `${quality}+${info.aid}`
    const ytDownloadUI = createYTDownloaderUI(id)
    const process = ytDownloadVideo(id, ytFormat, format.h, 
        (info) => ytDownloadUI.update(parseProgressInfo(info)),
        (code) => {
            ytDownloadManager.remove(id + quality)
            console.log(`Process Ended - ${code}`);
        }
    )
    ytDownloadUI.init(info.title, () => {
        process.kill();
    })
    utubeState.videoProgress[id + quality] = { ui: ytDownloadUI, process, startTime: Date.now() }
    ytDownloadManager.add(id + quality)
}

ipc.on('yt-service', function (e, data) {
    const { task, ytHash, tab } = data;
    if(task === "init") syncYTCache()
    else if(task === "play") {
        player.showMessage("Loading...", "warning", true)
        const fileName = utubeState.downloaded[ytHash];
        if(!fileName) { // download and then play
            player.showMessage("Downloading...", "warning", true)
            if(utubeState.progress[ytHash]) return // need to handle this better
            utubeState.progress[ytHash] = true
            ytDownloadMusicAndSync(ytHash).then(() => {
                delete utubeState.progress[ytHash]
                play(utubeState.downloaded[ytHash])
            })
        }
        else play(fileName)
    }
    else if(task === "pause") player.pause()
    else if(task === "yt-info"){
        ytDetails(ytHash).then(info => {
            const data = filterYTVideoFormats(info)
            e.sender.send('youtube-main', {...data, tab, type: 'forward-browser', task: "show-download-info"})
        }).catch(e => console.error("ERROR IN YT-INFO: ", e))
    }
    else if(task === "download-video") {
        const { downloadInfo, quality } = data
        console.log("SERVICE: DOWNLOAD VIDEO: ", downloadInfo, quality)
        ytDownloadVideoAndSync(downloadInfo, quality)
    }
})
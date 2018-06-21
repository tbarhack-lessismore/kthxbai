var video = document.createElement('video');
video.controls = false;
var mediaElement = getHTMLMediaElement(video, {
    title: '',
    buttons: [/*, 'take-snapshot'*/],
    showOnMouseEnter: false,
    width: "100%",
    onTakeSnapshot: function() {
        var canvas = document.createElement('canvas');
        canvas.width = mediaElement.clientWidth;
        canvas.height = mediaElement.clientHeight;

        var context = canvas.getContext('2d');
        context.drawImage(recordingPlayer, 0, 0, canvas.width, canvas.height);

        window.open(canvas.toDataURL('image/png'));
    }
});
document.getElementById('recording-player').appendChild(mediaElement);

var div = document.createElement('section');
mediaElement.media.parentNode.appendChild(div);
div.appendChild(mediaElement.media);

var recordingPlayer = mediaElement.media;
var mediaContainerFormat = document.querySelector('.media-container-format');
var mimeType = 'video/webm';
var fileExtension = 'webm';
var type = 'video';
var recorderType;
var defaultWidth;
var defaultHeight;

(function() {
  var params = {},
      r = /([^&=]+)=?([^&]*)/g;

  function d(s) {
      return decodeURIComponent(s.replace(/\+/g, ' '));
  }

  var match, search = window.location.search;
  while (match = r.exec(search.substring(1))) {
      params[d(match[1])] = d(match[2]);

      if(d(match[2]) === 'true' || d(match[2]) === 'false') {
          params[d(match[1])] = d(match[2]) === 'true' ? true : false;
      }
  }

  window.params = params;
})();

var btnStartRecording = document.querySelector('#btn-start-recording');

window.onbeforeunload = function() {
    btnStartRecording.disabled = false;
    mediaContainerFormat.disabled = false;
};

var seconds = 8;
function countdown() {

    $("body").addClass("is-recording");

    seconds--;
    $("#countdown").html(seconds + " seconds left!");

    if (seconds > 0) {
        setTimeout(countdown, 1000);
    }

    if (seconds==0) {
        $("body").removeClass("is-recording").addClass("is-previewing");
        $(".video-record-status").html("Post this video?");
        btnStartRecording.click();
    }
}

var btnNextTime = document.getElementById('btn-nexttime');

btnNextTime.onclick = function(event) {
    recordingPlayer.src=""
    nextVideoItem();
    $("body").removeClass("is-preparing is-previewing is-recording");
}

var btnTryAgain = document.getElementById('btn-tryagain');

btnTryAgain.onclick = function(event) {
    btnStartRecording.click();
}

btnStartRecording.onclick = function(event) {
    var button = btnStartRecording;

    if(button.innerHTML === 'Stop Recording') {
        button.disabled = true;
        button.disableStateWaiting = true;
        setTimeout(function() {
            button.disabled = false;
            button.disableStateWaiting = false;
        }, 2000);

        button.innerHTML = 'Start Recording';

        function stopStream() {
            if(button.stream && button.stream.stop) {
                button.stream.stop();
                button.stream = null;
            }

            if(button.stream instanceof Array) {
                button.stream.forEach(function(stream) {
                    stream.stop();
                });
                button.stream = null;
            }

            videoBitsPerSecond = null;
            var html = 'Recording status: stopped';
            html += '<br>Size: ' + bytesToSize(button.recordRTC.getBlob().size);
        }

        if(button.recordRTC) {
            if(button.recordRTC.length) {
                button.recordRTC[0].stopRecording(function(url) {
                    if(!button.recordRTC[1]) {
                        button.recordingEndedCallback(url);
                        stopStream();

                        saveToDiskOrOpenNewTab(button.recordRTC[0]);
                        return;
                    }

                    button.recordRTC[1].stopRecording(function(url) {
                        button.recordingEndedCallback(url);
                        stopStream();
                    });
                });
            }
            else {
                button.recordRTC.stopRecording(function(url) {
                    if(button.blobs && button.blobs.length) {
                        var blob = new File(button.blobs, getFileName(fileExtension), {
                            type: mimeType
                        });

                        button.recordRTC.getBlob = function() {
                            return blob;
                        };

                        url = URL.createObjectURL(blob);
                    }

                    button.recordingEndedCallback(url);
                    saveToDiskOrOpenNewTab(button.recordRTC);
                    stopStream();
                });
            }
        }

        return;
    }

    if(!event) return;

    button.disabled = true;

    var commonConfig = {
        onMediaCaptured: function(stream) {
            button.stream = stream;
            if(button.mediaCapturedCallback) {
                button.mediaCapturedCallback();
            }

            button.innerHTML = 'Stop Recording';
            button.disabled = false;
        },
        onMediaStopped: function() {
            button.innerHTML = 'Start Recording';

            if(!button.disableStateWaiting) {
                button.disabled = false;
            }
        },
        onMediaCapturingFailed: function(error) {
            console.error('onMediaCapturingFailed:', error);

            if(error.toString().indexOf('no audio or video tracks available') !== -1) {
                alert('RecordRTC failed to start because there are no audio or video tracks available.');
            }

            if(DetectRTC.browser.name === 'Safari') return;

            if(error.name === 'PermissionDeniedError' && DetectRTC.browser.name === 'Firefox') {
                alert('Firefox requires version >= 52. Firefox also requires HTTPs.');
            }

            commonConfig.onMediaStopped();
        }
    };


    // Force h264
    mediaContainerFormat.value = 'h264';

    if(mediaContainerFormat.value === 'h264') {
        mimeType = 'video/webm\;codecs=h264';
        fileExtension = 'mp4';

        // video/mp4;codecs=avc1
        if(isMimeTypeSupported('video/mpeg')) {
            mimeType = 'video/mpeg';
        }
    }

    if(mediaContainerFormat.value === 'default') {
        mimeType = 'video/webm';
        fileExtension = 'webm';
        recorderType = null;
        type = 'video';
    }

    // we are recording audio + video
    captureAudioPlusVideo(commonConfig);

    button.mediaCapturedCallback = function() {
        if(typeof MediaRecorder === 'undefined') { // opera or chrome etc.
            button.recordRTC = [];

            if(!params.bufferSize) {
                // it fixes audio issues whilst recording 720p
                params.bufferSize = 16384;
            }

            var options = {
                type: 'audio', // hard-code to set "audio"
                leftChannel: params.leftChannel || false,
                disableLogs: params.disableLogs || false,
                video: recordingPlayer
            };

            if(params.sampleRate) {
                options.sampleRate = parseInt(params.sampleRate);
            }

            if(params.bufferSize) {
                options.bufferSize = parseInt(params.bufferSize);
            }

            if(params.frameInterval) {
                options.frameInterval = parseInt(params.frameInterval);
            }

            if(recorderType) {
                options.recorderType = recorderType;
            }

            if(videoBitsPerSecond) {
                options.videoBitsPerSecond = videoBitsPerSecond;
            }

            options.ignoreMutedMedia = false;
            var audioRecorder = RecordRTC(button.stream, options);

            options.type = type;
            var videoRecorder = RecordRTC(button.stream, options);

            // to sync audio/video playbacks in browser!
            videoRecorder.initRecorder(function() {
                audioRecorder.initRecorder(function() {
                    audioRecorder.startRecording();
                    videoRecorder.startRecording();
                });
            });

            button.recordRTC.push(audioRecorder, videoRecorder);

            button.recordingEndedCallback = function() {
                var audio = new Audio();
                audio.src = audioRecorder.toURL();
                audio.controls = true;
                audio.autoplay = true;

                recordingPlayer.parentNode.appendChild(document.createElement('hr'));
                recordingPlayer.parentNode.appendChild(audio);

                if(audio.paused) audio.play();
            };
            return;
        }

        var options = {
            type: type,
            mimeType: mimeType,
            disableLogs: params.disableLogs || false,
            getNativeBlob: false, // enable it for longer recordings
            video: recordingPlayer
        };

        if(recorderType) {
            options.recorderType = recorderType;
        }

        if(videoBitsPerSecond) {
            options.videoBitsPerSecond = videoBitsPerSecond;
        }

        options.ignoreMutedMedia = false;
        button.recordRTC = RecordRTC(button.stream, options);

        button.recordingEndedCallback = function(url) {
            setVideoURL(url);
        };

        $("body").removeClass("is-recording is-previewing").addClass("is-preparing");

        var readyCount = 4;

        $("#getready > span").removeClass("active");

        $(".video-record-status").html("GET READY");

        function startReadyCountdown() {

            readyCount--;
            $(".ready-" + readyCount).addClass("active");

            if (readyCount > 0) {
                setTimeout(startReadyCountdown, 1000);
            }

            if (readyCount == 0) {
                $("body").removeClass("is-preparing");

                $(".video-record-status").html("RECORDING");
                button.recordRTC.startRecording();

                seconds = 5;
                countdown();
            }
        }

        startReadyCountdown();
    };
};

function captureAudioPlusVideo(config) {

    captureUserMedia({video: true, audio: true}, function(audioVideoStream) {
        config.onMediaCaptured(audioVideoStream);

        if(audioVideoStream instanceof Array) {

            audioVideoStream.forEach(function(stream) {
                addStreamStopListener(stream, function() {
                    config.onMediaStopped();
                });
            });
            return;
        }

        addStreamStopListener(audioVideoStream, function() {
            config.onMediaStopped();
        });
    }, function(error) {
        config.onMediaCapturingFailed(error);
    });
}

function isLocalHost() {
    // "chrome.exe" --enable-usermedia-screen-capturing
    // or firefox => about:config => "media.getusermedia.screensharing.allowed_domains" => add "localhost"
    return document.domain === 'localhost' || document.domain === '127.0.0.1';
}

function addStreamStopListener(stream, callback) {
  var streamEndedEvent = 'ended';

  if ('oninactive' in stream) {
      streamEndedEvent = 'inactive';
  }

  stream.addEventListener(streamEndedEvent, function() {
      callback();
      callback = function() {};
  }, false);

  stream.getAudioTracks().forEach(function(track) {
      track.addEventListener(streamEndedEvent, function() {
          callback();
          callback = function() {};
      }, false);
  });

  stream.getVideoTracks().forEach(function(track) {
      track.addEventListener(streamEndedEvent, function() {
          callback();
          callback = function() {};
      }, false);
  });
}



var videoBitsPerSecond;

function setVideoBitrates() {

    var value = 'default';

    if(value == 'default') {
        videoBitsPerSecond = null;
        return;
    }

    videoBitsPerSecond = parseInt(value);
}

function getFrameRates(mediaConstraints) {
    if(!mediaConstraints.video) {
        return mediaConstraints;
    }

    var value = 'default';

    if(value == 'default') {
        return mediaConstraints;
    }

    value = parseInt(value);

    if(DetectRTC.browser.name === 'Firefox') {
        mediaConstraints.video.frameRate = value;
        return mediaConstraints;
    }

    if(!mediaConstraints.video.mandatory) {
        mediaConstraints.video.mandatory = {};
        mediaConstraints.video.optional = [];
    }

    mediaConstraints.video.mandatory.minFrameRate = value;

    return mediaConstraints;
}

function addEventListenerToUploadLocalStorageItem(selector, arr, callback) {
    arr.forEach(function(event) {
        document.querySelector(selector).addEventListener(event, callback, false);
    });
}

function getVideoResolutions(mediaConstraints) {
    if(!mediaConstraints.video) {
        return mediaConstraints;
    }

    var value = "default";

    if(value == 'default') {
        return mediaConstraints;
    }

    value = value.split('x');

    if(value.length != 2) {
        return mediaConstraints;
    }

    defaultWidth = parseInt(value[0]);
    defaultHeight = parseInt(value[1]);

    if(DetectRTC.browser.name === 'Firefox') {
        mediaConstraints.video.width = defaultWidth;
        mediaConstraints.video.height = defaultHeight;
        return mediaConstraints;
    }

    if(!mediaConstraints.video.mandatory) {
        mediaConstraints.video.mandatory = {};
        mediaConstraints.video.optional = [];
    }


    mediaConstraints.video.mandatory.minWidth = defaultWidth;
    mediaConstraints.video.mandatory.minHeight = defaultHeight;

    return mediaConstraints;
}

function captureUserMedia(mediaConstraints, successCallback, errorCallback) {
    if(mediaConstraints.video == true) {
        mediaConstraints.video = {};
    }

    setVideoBitrates();

    mediaConstraints = getVideoResolutions(mediaConstraints);
    mediaConstraints = getFrameRates(mediaConstraints);

    var isBlackBerry = !!(/BB10|BlackBerry/i.test(navigator.userAgent || ''));
    if(isBlackBerry && !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)) {
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        navigator.getUserMedia(mediaConstraints, successCallback, errorCallback);
        return;
    }

    navigator.mediaDevices.getUserMedia(mediaConstraints).then(function(stream) {
        successCallback(stream);

        setVideoURL(stream, true);
    }).catch(function(error) {
        if(error && error.name === 'ConstraintNotSatisfiedError') {
            alert('Your camera or browser does NOT supports selected resolutions or frame-rates. \n\nPlease select "default" resolutions.');
        }

        errorCallback(error);
    });
}

function setMediaContainerFormat(arrayOfOptionsSupported) {
    var options = Array.prototype.slice.call(
        mediaContainerFormat.querySelectorAll('option')
    );

    var localStorageItem;
    if(localStorage.getItem('media-container-format')) {
        localStorageItem = localStorage.getItem('media-container-format');
    }

    var selectedItem;
    options.forEach(function(option) {
        option.disabled = true;

        if(arrayOfOptionsSupported.indexOf(option.value) !== -1) {
            option.disabled = false;

            if(localStorageItem && arrayOfOptionsSupported.indexOf(localStorageItem) != -1) {
                if(option.value != localStorageItem) return;
                option.selected = true;
                selectedItem = option;
                return;
            }

            if(!selectedItem) {
                option.selected = true;
                selectedItem = option;
            }
        }
    });
}

function isMimeTypeSupported(mimeType) {
    if(DetectRTC.browser.name === 'Edge' || DetectRTC.browser.name === 'Safari' || typeof MediaRecorder === 'undefined') {
        return false;
    }

    if(typeof MediaRecorder.isTypeSupported !== 'function') {
        return true;
    }

    return MediaRecorder.isTypeSupported(mimeType);
}

(function() {
    var isChrome = !!window.chrome && !(!!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0);

    var recordingOptions = [];

    if(isMimeTypeSupported('video/webm\;codecs=h264')) {
        recordingOptions.push('h264'); // MediaStreamRecorder with h264
    }

    recordingOptions.push('default'); // Default mimeType for MediaStreamRecorder

    setMediaContainerFormat(recordingOptions);
})();

function stringify(obj) {
    var result = '';
    Object.keys(obj).forEach(function(key) {
        if(typeof obj[key] === 'function') {
            return;
        }

        if(result.length) {
            result += ',';
        }

        result += key + ': ' + obj[key];
    });

    return result;
}

function mediaRecorderToStringify(mediaRecorder) {
    var result = '';
    result += 'mimeType: ' + mediaRecorder.mimeType;
    result += ', state: ' + mediaRecorder.state;
    result += ', audioBitsPerSecond: ' + mediaRecorder.audioBitsPerSecond;
    result += ', videoBitsPerSecond: ' + mediaRecorder.videoBitsPerSecond;
    if(mediaRecorder.stream) {
        result += ', streamid: ' + mediaRecorder.stream.id;
        result += ', stream-active: ' + mediaRecorder.stream.active;
    }
    return result;
}

function getFailureReport() {
    var info = 'RecordRTC seems failed. \n\n' + stringify(DetectRTC.browser) + '\n\n' + DetectRTC.osName + ' ' + DetectRTC.osVersion + '\n';

    if (typeof recorderType !== 'undefined' && recorderType) {
        info += '\nrecorderType: ' + recorderType.name;
    }

    if (typeof mimeType !== 'undefined') {
        info += '\nmimeType: ' + mimeType;
    }

    Array.prototype.slice.call(document.querySelectorAll('select')).forEach(function(select) {
        info += '\n' + (select.id || select.className) + ': ' + select.value;
    });

    if (btnStartRecording.recordRTC) {
        info += '\n\ninternal-recorder: ' + btnStartRecording.recordRTC.getInternalRecorder().name;

        if(btnStartRecording.recordRTC.getInternalRecorder().getAllStates) {
            info += '\n\nrecorder-states: ' + btnStartRecording.recordRTC.getInternalRecorder().getAllStates();
        }
    }

    if(btnStartRecording.stream) {
        info += '\n\naudio-tracks: ' + btnStartRecording.stream.getAudioTracks().length;
        info += '\nvideo-tracks: ' + btnStartRecording.stream.getVideoTracks().length;
        info += '\nstream-active? ' + !!btnStartRecording.stream.active;

        btnStartRecording.stream.getAudioTracks().concat(btnStartRecording.stream.getVideoTracks()).forEach(function(track) {
            info += '\n' + track.kind + '-track-' + (track.label || track.id) + ': (enabled: ' + !!track.enabled + ', readyState: ' + track.readyState + ', muted: ' + !!track.muted + ')';

            if(track.getConstraints && Object.keys(track.getConstraints()).length) {
                info += '\n' + track.kind + '-track-getConstraints: ' + stringify(track.getConstraints());
            }

            if(track.getSettings && Object.keys(track.getSettings()).length) {
                info += '\n' + track.kind + '-track-getSettings: ' + stringify(track.getSettings());
            }
        });
    }

    else if(btnStartRecording.recordRTC && btnStartRecording.recordRTC.getBlob()) {
        info += '\n\nblobSize: ' + bytesToSize(btnStartRecording.recordRTC.getBlob().size);
    }

    if(btnStartRecording.recordRTC && btnStartRecording.recordRTC.getInternalRecorder() && btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder && btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder()) {
        info += '\n\ngetInternalRecorder: ' + mediaRecorderToStringify(btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder());
    }

    return info;
}

function saveToDiskOrOpenNewTab(recordRTC) {
    if(!recordRTC.getBlob().size) {
        var info = getFailureReport();
        console.log('blob', recordRTC.getBlob());
        console.log('recordrtc instance', recordRTC);
        console.log('report', info);

        if(mediaContainerFormat.value !== 'default') {
            alert('RecordRTC seems failed recording using ' + mediaContainerFormat.value + '. Please choose "default" option from the drop down and record again.');
        }
        else {
            alert('RecordRTC seems failed. Unexpected issue. You can read the email in your console log. \n\nPlease report using disqus chat below.');
        }

        if(mediaContainerFormat.value !== 'vp9' && DetectRTC.browser.name === 'Chrome') {
            alert('Please record using VP9 encoder. (select from the dropdown)');
        }
    }

    var fileName = getFileName(fileExtension);

    // document.querySelector('#save-to-disk').parentNode.style.display = 'block';
    document.querySelector('#save-to-disk').onclick = function() {
        if(!recordRTC) return alert('No recording found.');

        var file = new File([recordRTC.getBlob()], fileName, {
            type: mimeType
        });

        invokeSaveAsDialog(file, file.name);
    };

    // upload to PHP server
    document.querySelector('#upload-to-php').disabled = false;
    document.querySelector('#upload-to-php').onclick = function() {
        if(!recordRTC) return alert('No recording found.');
        this.disabled = true;

        var button = this;
        uploadToPHPServer(fileName, recordRTC, function(progress, fileURL) {
            if(progress === 'ended') {
                button.disabled = false;
                button.innerHTML = 'Click to download from server';
                button.onclick = function() {
                    SaveFileURLToDisk(fileURL, fileName);
                };

                setVideoURL(fileURL);

                var html = 'Uploaded to PHP.<br>Download using below link:<br>';
                html += '<a href="'+fileURL+'" download="'+fileName+'" style="color: yellow; display: block; margin-top: 15px;">'+fileName+'</a>';
                recordingPlayer.parentNode.parentNode.querySelector('h2').innerHTML = html;
                return;
            }
            button.innerHTML = progress;
            recordingPlayer.parentNode.parentNode.querySelector('h2').innerHTML = progress;
        });
    };
}

function uploadToPHPServer(fileName, recordRTC, callback) {
    var blob = recordRTC instanceof Blob ? recordRTC : recordRTC.getBlob();

    blob = new File([blob], getFileName(fileExtension), {
        type: mimeType
    });

    // create FormData
    var formData = new FormData();
    formData.append('video-filename', fileName);
    formData.append('video-blob', blob);

    callback('Uploading recorded-file to server.');

    makeXMLHttpRequest('https://webrtcweb.com/RecordRTC/', formData, function(progress) {
        if (progress !== 'upload-ended') {
            callback(progress);
            return;
        }

        var initialURL = 'https://webrtcweb.com/RecordRTC/uploads/';

        callback('ended', initialURL + fileName);
    });
}

function makeXMLHttpRequest(url, data, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState == 4 && request.status == 200) {
            if(request.responseText === 'success') {
                callback('upload-ended');
                return;
            }

            document.querySelector('.header').parentNode.style = 'text-align: left; color: red; padding: 5px 10px;';
            document.querySelector('.header').parentNode.innerHTML = request.responseText;
        }
    };

    request.upload.onloadstart = function() {
        callback('Upload started...');
    };

    request.upload.onprogress = function(event) {
        callback('Upload Progress ' + Math.round(event.loaded / event.total * 100) + "%");
    };

    request.upload.onload = function() {
        callback('progress-about-to-end');
    };

    request.upload.onload = function() {
        callback('Getting File URL..');
    };

    request.upload.onerror = function(error) {
        callback('Failed to upload to server');
    };

    request.upload.onabort = function(error) {
        callback('Upload aborted.');
    };

    request.open('POST', url);
    request.send(data);
}

function getRandomString() {
    if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
        var a = window.crypto.getRandomValues(new Uint32Array(3)),
            token = '';
        for (var i = 0, l = a.length; i < l; i++) {
            token += a[i].toString(36);
        }
        return token;
    } else {
        return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
    }
}

function getFileName(fileExtension) {
    var d = new Date();
    var year = d.getUTCFullYear();
    var month = d.getUTCMonth();
    var date = d.getUTCDate();
    return 'RecordRTC-' + year + month + date + '-' + getRandomString() + '.' + fileExtension;
}

function SaveFileURLToDisk(fileUrl, fileName) {
    var hyperlink = document.createElement('a');
    hyperlink.href = fileUrl;
    hyperlink.target = '_blank';
    hyperlink.download = fileName || fileUrl;

    (document.body || document.documentElement).appendChild(hyperlink);
    hyperlink.onclick = function() {
       (document.body || document.documentElement).removeChild(hyperlink);

       // required for Firefox
       window.URL.revokeObjectURL(hyperlink.href);
    };

    var mouseEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    });

    hyperlink.dispatchEvent(mouseEvent);
}

function getURL(arg) {
    var url = arg;

    if(arg instanceof Blob || arg instanceof File) {
        url = URL.createObjectURL(arg);
    }

    if(arg instanceof RecordRTC || arg.getBlob) {
        url = URL.createObjectURL(arg.getBlob());
    }

    if(arg instanceof MediaStream || arg.getTracks || arg.getVideoTracks || arg.getAudioTracks) {
        // url = URL.createObjectURL(arg);
    }

    return url;
}

function setVideoURL(arg, forceNonImage, rollNext) {
    var url = getURL(arg);

    var parentNode = recordingPlayer.parentNode;
    parentNode.removeChild(recordingPlayer);
    parentNode.innerHTML = '';

    var elem = 'video';
    if(type == 'gif' && !forceNonImage) {
        elem = 'img';
    }
    if(type == 'audio') {
        elem = 'audio';
    }

    recordingPlayer = document.createElement(elem);

    if (!rollNext) {
        recordingPlayer.loop = true;
    }

    if(arg instanceof MediaStream) {
        recordingPlayer.muted = true;
    }

    recordingPlayer.addEventListener('loadedmetadata', function() {
        if(navigator.userAgent.toLowerCase().indexOf('android') == -1) return;

        // android
        setTimeout(function() {
            if(typeof recordingPlayer.play === 'function') {
                recordingPlayer.play();
            }
        }, 2000);
    }, false);

    recordingPlayer.poster = '';

    if(arg instanceof MediaStream) {
        recordingPlayer.srcObject = arg;
    }
    else {
        recordingPlayer.src = url;
    }

    if(typeof recordingPlayer.play === 'function') {
        recordingPlayer.play();
        flipIt(false);
    }

    if (rollNext) {
        recordingPlayer.addEventListener('ended', nextVideoItem);
    }

    parentNode.appendChild(recordingPlayer);
}


function createThumbnail() {
    var canvas = document.createElement('canvas');
    canvas.width = recordingPlayer.clientWidth;
    canvas.height = recordingPlayer.clientHeight;

    var context = canvas.getContext('2d');
    context.drawImage(recordingPlayer, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
}

var btnSend = document.getElementById('btn-send');

var videoItemGroup = document.getElementById('video-item-group');

btnSend.onclick = function() {
    var src = recordingPlayer.src;
    var thumbnailUrl = createThumbnail();

    recordingPlayer.currentTime = 0;
    recordingPlayer.play();

    $('<div class="video-item"><div><div><img /></div></div></div>')
        .data("src", src)
        .find("img")
            .attr("src", thumbnailUrl)
        .end()
        .appendTo(videoItemGroup)
        .click();

    $("body").removeClass("is-recording is-previewing");
}

$(document).on('click', '.video-item', function(){
    var $videoItem = $(this);
    var src = $videoItem.data("src");

    try {
        setVideoURL(src, false, true);
    } catch(e) {}

    $(".video-item").removeClass("active");
    $videoItem.addClass("active");

    centerTo($videoItem);
});

function nextVideoItem() {

    var $nextVideoItem = $(".video-item.active").next(".video-item");

    if ($nextVideoItem.length < 1) {
        $nextVideoItem = $(".video-item:first");
    }

    $nextVideoItem.click();
}

var flip = false,
   pause = "M11,10 L18,13.74 18,22.28 11,26 M18,13.74 L26,18 26,18 18,22.28",
   play = "M11,10 L17,10 17,26 11,26 M20,10 L26,10 26,26 20,26",
   $animation = $('#animation');

$animation.attr({
"from": flip ? pause : play,
"to": flip ? play : pause
}).get(0).beginElement();

function flipIt(paused) {
    if (paused==true) {
       flip = false;
    } else {
       flip = !flip;
    }
    $(".ytp-play-button").toggleClass("paused", flip);
    $animation.attr({
        "from": flip ? pause : play,
        "to": flip ? play : pause
    }).get(0).beginElement();
}
$(".ytp-play-button").on('click', flipIt);

$("#btn-play").on('click', function() {

    if (recordingPlayer.paused) {
        recordingPlayer.play();
        recordingPlayer.addEventListener('ended', nextVideoItem);
    } else {
        recordingPlayer.removeEventListener('ended', nextVideoItem);
        recordingPlayer.pause();
    }
});


$(".prev-button").on('click', function() {

    var container = $(".video-item-group-container");
    var viewportWidth = $(".video-nav").width();
    var videoItemGroupWidth = $(".video-item-group").width();

    var maxLeft = viewportWidth - videoItemGroupWidth + 10; // 10px right padding
    var maxLeft = maxLeft * -1; // negative

    var currentLeft = container.position().left;
    var newLeft = currentLeft + (viewportWidth * 0.75);

    if (newLeft > 0) {
        newLeft = 0;
    }

    container.css("left", newLeft + "px");
});

$(".next-button").on('click', function() {

    var container = $(".video-item-group-container");
    var viewportWidth = $(".video-nav").width();
    var videoItemGroupWidth = $(".video-item-group").width();

    var maxLeft = viewportWidth - videoItemGroupWidth + 10; // 10px right padding
    var maxLeft = maxLeft * -1; // negative

    var currentLeft = container.position().left;
    var newLeft = currentLeft - (viewportWidth * 0.75);

    if (newLeft < maxLeft) {
        newLeft = maxLeft;
    }

    container.css("left", newLeft + "px");
});

function centerTo($videoItem) {

    var container = $(".video-item-group-container");
    var $videoItemGroup = $(".video-item-group");
    var viewportWidth = $(".video-nav").width();
    var videoItemGroupWidth = $(".video-item-group").width();

    var maxLeft = viewportWidth - videoItemGroupWidth + 10; // 10px right padding
    var maxLeft = maxLeft * -1; // negative

    var videoLeft = ($videoItem.position().left * -1) + 10 + ($videoItem.width() / 2); // 10px left padding

    if (videoLeft > 0) {
        videoLeft = 0;
    }

    if (videoLeft < maxLeft) {
        videoLeft = maxLeft;
    }

    container.css("left", videoLeft + "px");
}
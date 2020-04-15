import {Injectable, isDevMode, Inject} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import { THEMES_CONFIG } from '../themes';
import { Router } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class PostsService {
    path = '';
    audioFolder = '';
    videoFolder = '';
    startPath = null; // 'http://localhost:17442/';
    startPathSSL = null; // 'https://localhost:17442/'
    handShakeComplete = false;
    THEMES_CONFIG = THEMES_CONFIG;
    theme;
    settings_changed = new BehaviorSubject<boolean>(false);
    auth_token = '4241b401-7236-493e-92b5-b72696b9d853';
    httpOptions = null;

    debugMode = false;
    constructor(private http: HttpClient, private router: Router, @Inject(DOCUMENT) private document: Document) {
        console.log('PostsService Initialized...');
        // this.startPath = window.location.href + '/api/';
        // this.startPathSSL = window.location.href + '/api/';
        this.path = this.document.location.origin + '/api/';

        if (isDevMode()) {
            this.debugMode = true;
            this.path = 'http://localhost:17442/api/';
        }

        this.httpOptions = {
            params: new HttpParams({
              fromString: `apiKey=${this.auth_token}`
            }),
        };
    }

    setTheme(theme) {
        this.theme = this.THEMES_CONFIG[theme];
    }

    startHandshake(url: string) {
        return this.http.get(url + 'geturl');
    }

    startHandshakeSSL(url: string) {
        return this.http.get(url + 'geturl');
    }

    getVideoFolder() {
        return this.http.get(this.startPath + 'videofolder');
    }

    getAudioFolder() {
        return this.http.get(this.startPath + 'audiofolder');
    }

    // tslint:disable-next-line: max-line-length
    makeMP3(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null) {
        return this.http.post(this.path + 'tomp3', {url: url,
                                                    maxBitrate: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration,
                                                    customArgs: customArgs,
                                                    customOutput: customOutput,
                                                    youtubeUsername: youtubeUsername,
                                                    youtubePassword: youtubePassword}, this.httpOptions);
    }

    // tslint:disable-next-line: max-line-length
    makeMP4(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null) {
        return this.http.post(this.path + 'tomp4', {url: url,
                                                    selectedHeight: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration,
                                                    customArgs: customArgs,
                                                    customOutput: customOutput,
                                                    youtubeUsername: youtubeUsername,
                                                    youtubePassword: youtubePassword}, this.httpOptions);
    }

    getFileStatusMp3(name: string) {
        return this.http.post(this.path + 'fileStatusMp3', {name: name}, this.httpOptions);
    }

    getFileStatusMp4(name: string) {
        return this.http.post(this.path + 'fileStatusMp4', {name: name}, this.httpOptions);
    }

    loadNavItems() {
        if (isDevMode()) {
            return this.http.get('./assets/default.json');
        } else {
            return this.http.get(this.path + 'config', this.httpOptions);
        }
    }

    loadAsset(name) {
        return this.http.get(`./assets/${name}`);
    }

    setConfig(config) {
        return this.http.post(this.path + 'setConfig', {new_config_file: config}, this.httpOptions);
    }

    deleteFile(uid: string, isAudio: boolean, blacklistMode = false) {
        if (isAudio) {
            return this.http.post(this.path + 'deleteMp3', {uid: uid, blacklistMode: blacklistMode}, this.httpOptions);
        } else {
            return this.http.post(this.path + 'deleteMp4', {uid: uid, blacklistMode: blacklistMode}, this.httpOptions);
        }
    }

    getMp3s() {
        return this.http.get(this.path + 'getMp3s', this.httpOptions);
    }

    getMp4s() {
        return this.http.get(this.path + 'getMp4s', this.httpOptions);
    }

    getFile(uid, type) {
        return this.http.post(this.path + 'getFile', {uid: uid, type: type}, this.httpOptions);
    }

    downloadFileFromServer(fileName, type, outputName = null, fullPathProvided = null, subscriptionName = null, subPlaylist = null) {
        return this.http.post(this.path + 'downloadFile', {fileNames: fileName,
                                                            type: type,
                                                            zip_mode: Array.isArray(fileName),
                                                            outputName: outputName,
                                                            fullPathProvided: fullPathProvided,
                                                            subscriptionName: subscriptionName,
                                                            subPlaylist: subPlaylist
                                                            },
                                                          {responseType: 'blob', headers: this.httpOptions.headers});
    }

    downloadArchive(sub) {
        return this.http.post(this.path + 'downloadArchive', {sub: sub}, {responseType: 'blob', headers: this.httpOptions.headers});
    }

    getFileInfo(fileNames, type, urlMode) {
        return this.http.post(this.path + 'getVideoInfos', {fileNames: fileNames, type: type, urlMode: urlMode}, this.httpOptions);
    }

    isPinSet() {
        return this.http.post(this.path + 'isPinSet', {}, this.httpOptions);
    }

    setPin(unhashed_pin) {
        return this.http.post(this.path + 'setPin', {pin: unhashed_pin}, this.httpOptions);
    }

    checkPin(unhashed_pin) {
        return this.http.post(this.path + 'checkPin', {input_pin: unhashed_pin}, this.httpOptions);
    }

    generateNewAPIKey() {
        return this.http.post(this.path + 'generateNewAPIKey', {}, this.httpOptions);
    }

    enableSharing(uid, type, is_playlist) {
        return this.http.post(this.path + 'enableSharing', {uid: uid, type: type, is_playlist: is_playlist}, this.httpOptions);
    }

    disableSharing(uid, type, is_playlist) {
        return this.http.post(this.path + 'disableSharing', {uid: uid, type: type, is_playlist: is_playlist}, this.httpOptions);
    }

    createPlaylist(playlistName, fileNames, type, thumbnailURL) {
        return this.http.post(this.path + 'createPlaylist', {playlistName: playlistName,
                                                            fileNames: fileNames,
                                                            type: type,
                                                            thumbnailURL: thumbnailURL}, this.httpOptions);
    }

    getPlaylist(playlistID, type) {
        return this.http.post(this.path + 'getPlaylist', {playlistID: playlistID,
                                                            type: type}, this.httpOptions);
    }

    updatePlaylist(playlistID, fileNames, type) {
        return this.http.post(this.path + 'updatePlaylist', {playlistID: playlistID,
                                                            fileNames: fileNames,
                                                            type: type}, this.httpOptions);
    }

    removePlaylist(playlistID, type) {
        return this.http.post(this.path + 'deletePlaylist', {playlistID: playlistID, type: type}, this.httpOptions);
    }

    createSubscription(url, name, timerange = null, streamingOnly = false) {
        return this.http.post(this.path + 'subscribe', {url: url, name: name, timerange: timerange, streamingOnly: streamingOnly},
                            this.httpOptions);
    }

    unsubscribe(sub, deleteMode = false) {
        return this.http.post(this.path + 'unsubscribe', {sub: sub, deleteMode: deleteMode}, this.httpOptions)
    }

    deleteSubscriptionFile(sub, file, deleteForever) {
        return this.http.post(this.path + 'deleteSubscriptionFile', {sub: sub, file: file, deleteForever: deleteForever}, this.httpOptions)
    }

    getSubscription(id) {
        return this.http.post(this.path + 'getSubscription', {id: id}, this.httpOptions);
    }

    getAllSubscriptions() {
        return this.http.post(this.path + 'getAllSubscriptions', {}, this.httpOptions);
    }

    // updates the server to the latest version
    updateServer(tag) {
        return this.http.post(this.path + 'updateServer', {tag: tag}, this.httpOptions);
    }

    getUpdaterStatus() {
        return this.http.get(this.path + 'updaterStatus', this.httpOptions);
    }

    // gets tag of the latest version of youtubedl-material
    getLatestGithubRelease() {
        return this.http.get('https://api.github.com/repos/tzahi12345/youtubedl-material/releases/latest');
    }

    getAvailableRelease() {
        return this.http.get('https://api.github.com/repos/tzahi12345/youtubedl-material/releases');
    }

}

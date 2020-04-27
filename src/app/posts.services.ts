import {Injectable, isDevMode, Inject} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import { THEMES_CONFIG } from '../themes';
import { Router, CanActivate } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class PostsService implements CanActivate {
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
    session_id = null;
    httpOptions = null;
    http_params: string = null;
    unauthorized = false;

    debugMode = false;

    isLoggedIn = false;
    token = null;
    user = null;

    reload_config = new BehaviorSubject<boolean>(false);
    config_reloaded = new BehaviorSubject<boolean>(false);

    config = null;
    constructor(private http: HttpClient, private router: Router, @Inject(DOCUMENT) private document: Document,
                public snackBar: MatSnackBar) {
        console.log('PostsService Initialized...');
        // this.startPath = window.location.href + '/api/';
        // this.startPathSSL = window.location.href + '/api/';
        this.path = this.document.location.origin + '/api/';
        this.session_id = uuid();
        if (isDevMode()) {
            this.debugMode = true;
            this.path = 'http://localhost:17442/api/';
        }

        this.http_params = `apiKey=${this.auth_token}&sessionID=${this.session_id}`

        this.httpOptions = {
            params: new HttpParams({
              fromString: this.http_params
            }),
        };

        // get config
        this.loadNavItems().subscribe(res => {
            const result = !this.debugMode ? res['config_file'] : res;
            if (result) {
                this.config = result['YoutubeDLMaterial'];
                if (this.config['Advanced']['multi_user_mode']) {
                    // login stuff
                    if (localStorage.getItem('jwt_token')) {
                        this.token = localStorage.getItem('jwt_token');
                        this.httpOptions = {
                            params: new HttpParams({
                            fromString: `apiKey=${this.auth_token}&sessionID=${this.session_id}&jwt=${this.token}`
                            }),
                        };
                        this.jwtAuth();
                    }
                }
            }
        });
    }
    canActivate(route, state): Promise<boolean> {
        return new Promise(resolve => {
            resolve(true);
        })
        console.log(route);
        throw new Error('Method not implemented.');
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

    reloadConfig() {
        this.loadNavItems().subscribe(res => {
            const result = !this.debugMode ? res['config_file'] : res;
            if (result) {
                this.config = result['YoutubeDLMaterial'];
            }
        });
    }

    getVideoFolder() {
        return this.http.get(this.startPath + 'videofolder');
    }

    getAudioFolder() {
        return this.http.get(this.startPath + 'audiofolder');
    }

    // tslint:disable-next-line: max-line-length
    makeMP3(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, ui_uid = null) {
        return this.http.post(this.path + 'tomp3', {url: url,
                                                    maxBitrate: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration,
                                                    customArgs: customArgs,
                                                    customOutput: customOutput,
                                                    youtubeUsername: youtubeUsername,
                                                    youtubePassword: youtubePassword,
                                                    ui_uid: ui_uid}, this.httpOptions);
    }

    // tslint:disable-next-line: max-line-length
    makeMP4(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, ui_uid = null) {
        return this.http.post(this.path + 'tomp4', {url: url,
                                                    selectedHeight: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration,
                                                    customArgs: customArgs,
                                                    customOutput: customOutput,
                                                    youtubeUsername: youtubeUsername,
                                                    youtubePassword: youtubePassword,
                                                    ui_uid: ui_uid}, this.httpOptions);
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
                                                          {responseType: 'blob', params: this.httpOptions.params});
    }

    downloadArchive(sub) {
        return this.http.post(this.path + 'downloadArchive', {sub: sub}, {responseType: 'blob', params: this.httpOptions.params});
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

    // current downloads
    getCurrentDownloads() {
        return this.http.get(this.path + 'downloads', this.httpOptions);
    }

    // current download
    getCurrentDownload(session_id, download_id) {
        return this.http.post(this.path + 'download', {download_id: download_id, session_id: session_id}, this.httpOptions);
    }

    // clear downloads. download_id is optional, if it exists only 1 download will be cleared
    clearDownloads(delete_all = false, session_id = null, download_id = null) {
        return this.http.post(this.path + 'clearDownloads', {delete_all: delete_all,
                                                            download_id: download_id,
                                                            session_id: session_id ? session_id : this.session_id}, this.httpOptions);
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

    afterLogin(user, token) {
        this.isLoggedIn = true;
        this.user = user;
        this.token = token;

        localStorage.setItem('jwt_token', this.token);

        this.httpOptions = {
            params: new HttpParams({
              fromString: `apiKey=${this.auth_token}&sessionID=${this.session_id}&jwt=${this.token}`
            }),
        };

        if (this.router.url === '/login') {
            this.router.navigate(['/home']);
        }
    }

    // user methods
    login(username, password) {
        const call = this.http.post(this.path + 'auth/login', {userid: username, password: password}, this.httpOptions);
        call.subscribe(res => {
            if (res['token']) {
                this.afterLogin(res['user'], res['token']);
            }
        });
        return call;
    }

    // user methods
    jwtAuth() {
        const call = this.http.post(this.path + 'auth/jwtAuth', {}, this.httpOptions);
        call.subscribe(res => {
            if (res['token']) {
                this.afterLogin(res['user'], res['token']);
            }
        }, err => {
            if (err.status === 401) {
                this.sendToLogin();
            }
        });
        return call;
    }

    logout() {
        this.user = null;
        this.isLoggedIn = false;
        localStorage.setItem('jwt_token', null);
        if (this.router.url !== '/login') {
            this.router.navigate(['/login']);
        }

        // resets http params
        this.http_params = `apiKey=${this.auth_token}&sessionID=${this.session_id}`

        this.httpOptions = {
            params: new HttpParams({
              fromString: this.http_params
            }),
        };
    }

    // user methods
    register(username, password) {
        const call = this.http.post(this.path + 'auth/register', {userid: username,
                                                                username: username,
                                                                password: password}, this.httpOptions);
        /*call.subscribe(res => {
            console.log(res['user']);
            if (res['user']) {
                // this.afterRegistration(res['user']);
            }
        });*/
        return call;
    }

    sendToLogin() {
        if (this.router.url === '/login') {
            return;
        }

        this.router.navigate(['/login']);

        // send login notification
        this.openSnackBar('You must log in to access this page!');
    }

    public openSnackBar(message: string, action: string = '') {
        this.snackBar.open(message, action, {
          duration: 2000,
        });
    }

}

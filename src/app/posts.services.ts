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
import { MatSnackBar } from '@angular/material/snack-bar';
import * as Fingerprint2 from 'fingerprintjs2';
import {
    CreatePlaylistRequest,
    CreatePlaylistResponse,
    DeleteMp3Mp4Request,
    DeletePlaylistRequest,
    DeleteSubscriptionFileRequest,
    FileType,
    GetAllDownloadsResponse,
    GetAllFilesResponse,
    GetAllSubscriptionsResponse,
    GetDownloadResponse,
    GetDownloadRequest,
    GetFileRequest,
    GetFileResponse,
    GetMp3sResponse,
    GetMp4sResponse,
    GetPlaylistRequest,
    GetPlaylistResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    Mp3DownloadRequest,
    Mp3DownloadResponse,
    Mp4DownloadRequest,
    Mp4DownloadResponse,
    Playlist,
    SharingToggle,
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionRequestData,
    SuccessObject,
    UnsubscribeRequest,
    UnsubscribeResponse,
    UpdatePlaylistFilesRequest,
    UpdatePlaylistRequest,
} from 'api-types';

@Injectable()
export class PostsService implements CanActivate {
    path = '';

    // local settings
    THEMES_CONFIG = THEMES_CONFIG;
    theme;
    card_size = 'medium';
    sidepanel_mode = 'over';

    // auth
    auth_token = '4241b401-7236-493e-92b5-b72696b9d853';
    session_id = null;
    httpOptions: {
        params: HttpParams
    };
    http_params: string = null;
    unauthorized = false;

    debugMode = false;

    // must be reset after logout
    isLoggedIn = false;
    token = null;
    user = null;
    permissions = null;

    available_permissions = null;

    // behavior subjects
    reload_config = new BehaviorSubject<boolean>(false);
    config_reloaded = new BehaviorSubject<boolean>(false);
    service_initialized = new BehaviorSubject<boolean>(false);
    settings_changed = new BehaviorSubject<boolean>(false);
    open_create_default_admin_dialog = new BehaviorSubject<boolean>(false);

    // app status
    initialized = false;

    // global vars
    config = null;
    subscriptions = null;
    sidenav = null;

    constructor(private http: HttpClient, private router: Router, @Inject(DOCUMENT) private document: Document,
                public snackBar: MatSnackBar) {
        console.log('PostsService Initialized...');
        this.path = this.document.location.origin + '/api/';

        if (isDevMode()) {
            this.debugMode = true;
            this.path = 'http://localhost:17442/api/';
        }

        this.http_params = `apiKey=${this.auth_token}`

        this.httpOptions = {
            params: new HttpParams({
              fromString: this.http_params
            })
        };

        Fingerprint2.get(components => {
            // set identity as user id doesn't necessarily exist
            this.session_id = Fingerprint2.x64hash128(components.map(function (pair) { return pair.value; }).join(), 31);
            this.httpOptions.params = this.httpOptions.params.set('sessionID', this.session_id);
        });

        const redirect_not_required = window.location.href.includes('/player') || window.location.href.includes('/login');

        // get config
        this.loadNavItems().subscribe(res => {
            const result = !this.debugMode ? res['config_file'] : res;
            if (result) {
                this.config = result['YoutubeDLMaterial'];
                if (this.config['Advanced']['multi_user_mode']) {
                    this.checkAdminCreationStatus();
                    // login stuff
                    if (localStorage.getItem('jwt_token') && localStorage.getItem('jwt_token') !== 'null') {
                        this.token = localStorage.getItem('jwt_token');
                        this.httpOptions.params = this.httpOptions.params.set('jwt', this.token);
                        this.jwtAuth();
                    } else if (redirect_not_required) {
                        this.setInitialized();
                    } else {
                        this.sendToLogin();
                    }
                } else {
                    this.setInitialized();
                }
            }
        });

        this.reload_config.subscribe(yes_reload => {
            if (yes_reload) { this.reloadConfig(); }
        });

        if (localStorage.getItem('sidepanel_mode')) {
            this.sidepanel_mode = localStorage.getItem('sidepanel_mode');
        }

        if (localStorage.getItem('card_size')) {
            this.card_size = localStorage.getItem('card_size');
        }
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

    getSubscriptionByID(sub_id) {
        for (let i = 0; i < this.subscriptions.length; i++) {
            if (this.subscriptions[i]['id'] === sub_id) {
                return this.subscriptions[i];
            }
        }
        return null;
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
                this.config_reloaded.next(true);
            }
        });
    }

    // tslint:disable-next-line: max-line-length
    makeMP3(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, ui_uid: string = null) {
        const body: Mp3DownloadRequest = {url: url,
            maxBitrate: selectedQuality,
            customQualityConfiguration: customQualityConfiguration,
            customArgs: customArgs,
            customOutput: customOutput,
            youtubeUsername: youtubeUsername,
            youtubePassword: youtubePassword,
            ui_uid: ui_uid}
        return this.http.post<Mp3DownloadResponse>(this.path + 'tomp3', body, this.httpOptions);
    }

    // tslint:disable-next-line: max-line-length
    makeMP4(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, ui_uid = null) {
        const body: Mp4DownloadRequest = {url: url,
            selectedHeight: selectedQuality,
            customQualityConfiguration: customQualityConfiguration,
            customArgs: customArgs,
            customOutput: customOutput,
            youtubeUsername: youtubeUsername,
            youtubePassword: youtubePassword,
            ui_uid: ui_uid}
        return this.http.post<Mp4DownloadResponse>(this.path + 'tomp4', body, this.httpOptions);
    }

    killAllDownloads() {
        return this.http.post(this.path + 'killAllDownloads', {}, this.httpOptions);
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
        const body: DeleteMp3Mp4Request = {uid: uid, blacklistMode: blacklistMode}
        if (isAudio) {
            return this.http.post<boolean>(this.path + 'deleteMp3', body, this.httpOptions);
        } else {
            return this.http.post<boolean>(this.path + 'deleteMp4', body, this.httpOptions);
        }
    }

    getMp3s() {
        return this.http.get<GetMp3sResponse>(this.path + 'getMp3s', this.httpOptions);
    }

    getMp4s() {
        return this.http.get<GetMp4sResponse>(this.path + 'getMp4s', this.httpOptions);
    }

    getFile(uid: string, type: FileType, uuid: string = null) {
        const body: GetFileRequest = {uid: uid, type: type, uuid: uuid};
        return this.http.post<GetFileResponse>(this.path + 'getFile', body, this.httpOptions);
    }

    getAllFiles() {
        return this.http.post<GetAllFilesResponse>(this.path + 'getAllFiles', {}, this.httpOptions);
    }

    downloadFileFromServer(fileName, type, outputName = null, fullPathProvided = null, subscriptionName = null, subPlaylist = null,
                            uid = null, uuid = null, id = null) {
        return this.http.post(this.path + 'downloadFile', {fileNames: fileName,
                                                            type: type,
                                                            zip_mode: Array.isArray(fileName),
                                                            outputName: outputName,
                                                            fullPathProvided: fullPathProvided,
                                                            subscriptionName: subscriptionName,
                                                            subPlaylist: subPlaylist,
                                                            uuid: uuid,
                                                            uid: uid,
                                                            id: id
                                                            },
                                                          {responseType: 'blob', params: this.httpOptions.params});
    }

    uploadCookiesFile(fileFormData) {
        return this.http.post(this.path + 'uploadCookies', fileFormData, this.httpOptions);
    }

    downloadArchive(sub) {
        return this.http.post(this.path + 'downloadArchive', {sub: sub}, {responseType: 'blob', params: this.httpOptions.params});
    }

    getFileInfo(fileNames, type, urlMode) {
        return this.http.post(this.path + 'getVideoInfos', {fileNames: fileNames, type: type, urlMode: urlMode}, this.httpOptions);
    }

    getLogs(lines = 50) {
        return this.http.post(this.path + 'logs', {lines: lines}, this.httpOptions);
    }

    clearAllLogs() {
        return this.http.post(this.path + 'clearAllLogs', {}, this.httpOptions);
    }

    generateNewAPIKey() {
        return this.http.post(this.path + 'generateNewAPIKey', {}, this.httpOptions);
    }

    enableSharing(uid: string, type: FileType, is_playlist: boolean) {
        const body: SharingToggle = {uid: uid, type: type, is_playlist: is_playlist};
        return this.http.post<SuccessObject>(this.path + 'enableSharing', body, this.httpOptions);
    }

    disableSharing(uid: string, type: FileType, is_playlist: boolean) {
        const body: SharingToggle = {uid: uid, type: type, is_playlist: is_playlist};
        return this.http.post<SuccessObject>(this.path + 'disableSharing', body, this.httpOptions);
    }

    createPlaylist(playlistName: string, fileNames: string[], type: FileType, thumbnailURL: string, duration: number = null) {
        const body: CreatePlaylistRequest = {playlistName: playlistName,
            fileNames: fileNames,
            type: type,
            thumbnailURL: thumbnailURL,
            duration: duration};
        return this.http.post<CreatePlaylistResponse>(this.path + 'createPlaylist', body, this.httpOptions);
    }

    getPlaylist(playlistID: string, type: FileType, uuid: string = null) {
        const body: GetPlaylistRequest = {playlistID: playlistID,
            type: type, uuid: uuid};
        return this.http.post<GetPlaylistResponse>(this.path + 'getPlaylist', body, this.httpOptions);
    }

    updatePlaylist(playlist: Playlist) {
        const body: UpdatePlaylistRequest = {playlist: playlist};
        return this.http.post<SuccessObject>(this.path + 'updatePlaylist', body, this.httpOptions);
    }

    updatePlaylistFiles(playlistID: string, fileNames: string[], type: FileType) {
        const body: UpdatePlaylistFilesRequest = {playlistID: playlistID,
            fileNames: fileNames,
            type: type};
        return this.http.post<SuccessObject>(this.path + 'updatePlaylistFiles', body, this.httpOptions);
    }

    removePlaylist(playlistID: string, type: FileType) {
        const body: DeletePlaylistRequest = {playlistID: playlistID, type: type};
        return this.http.post<SuccessObject>(this.path + 'deletePlaylist', body, this.httpOptions);
    }

    createSubscription(url: string, name: string, timerange: string = null, streamingOnly = false, audioOnly = false, customArgs: string = null, customFileOutput: string = null) {
        const body: SubscribeRequest = {url: url, name: name, timerange: timerange, streamingOnly: streamingOnly,
            audioOnly: audioOnly, customArgs: customArgs, customFileOutput: customFileOutput};
        return this.http.post<SubscribeResponse>(this.path + 'subscribe', body, this.httpOptions);
    }

    updateSubscription(subscription) {
        return this.http.post(this.path + 'updateSubscription', {subscription: subscription}, this.httpOptions);
    }

    unsubscribe(sub: SubscriptionRequestData, deleteMode = false) {
        const body: UnsubscribeRequest = {sub: sub, deleteMode: deleteMode};
        return this.http.post<UnsubscribeResponse>(this.path + 'unsubscribe', body, this.httpOptions)
    }

    deleteSubscriptionFile(sub: SubscriptionRequestData, file: string, deleteForever: boolean, file_uid: string) {
        const body: DeleteSubscriptionFileRequest = {sub: sub, file: file, deleteForever: deleteForever,
            file_uid: file_uid};
        return this.http.post<SuccessObject>(this.path + 'deleteSubscriptionFile', body, this.httpOptions)
    }

    getSubscription(id: string) {
        const body: GetSubscriptionRequest = {id: id};
        return this.http.post<GetSubscriptionResponse>(this.path + 'getSubscription', body, this.httpOptions);
    }

    getAllSubscriptions() {
        return this.http.post<GetAllSubscriptionsResponse>(this.path + 'getAllSubscriptions', {}, this.httpOptions);
    }

    // current downloads
    getCurrentDownloads() {
        return this.http.get<GetAllDownloadsResponse>(this.path + 'downloads', this.httpOptions);
    }

    // current download
    getCurrentDownload(session_id: string, download_id: string) {
        const body: GetDownloadRequest = {download_id: download_id, session_id: session_id};
        return this.http.post<GetDownloadResponse>(this.path + 'download', body, this.httpOptions);
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

    afterLogin(user, token, permissions, available_permissions) {
        this.isLoggedIn = true;
        this.user = user;
        this.permissions = permissions;
        this.available_permissions = available_permissions;
        this.token = token;

        localStorage.setItem('jwt_token', this.token);
        this.httpOptions.params = this.httpOptions.params.set('jwt', this.token);

        this.setInitialized();
        // needed to re-initialize parts of app after login
        this.config_reloaded.next(true);

        if (this.router.url === '/login') {
            this.router.navigate(['/home']);
        }
    }

    // user methods
    login(username, password) {
        const call = this.http.post(this.path + 'auth/login', {username: username, password: password}, this.httpOptions);
        return call;
    }

    // user methods
    jwtAuth() {
        const call = this.http.post(this.path + 'auth/jwtAuth', {}, this.httpOptions);
        call.subscribe(res => {
            if (res['token']) {
                this.afterLogin(res['user'], res['token'], res['permissions'], res['available_permissions']);
            }
        }, err => {
            if (err.status === 401) {
                this.sendToLogin();
                this.token = null;
                this.resetHttpParams();
            }
            console.log(err);
        });
        return call;
    }

    logout() {
        this.user = null;
        this.permissions = null;
        this.isLoggedIn = false;
        this.token = null;
        localStorage.setItem('jwt_token', null);
        if (this.router.url !== '/login') {
            this.router.navigate(['/login']);
        }

        this.resetHttpParams();
    }

    // user methods
    register(username, password) {
        const call = this.http.post(this.path + 'auth/register', {userid: username,
                                                                username: username,
                                                                password: password}, this.httpOptions);
        return call;
    }

    sendToLogin() {
        if (!this.initialized) {
            this.setInitialized();
        }
        if (this.router.url === '/login') {
            return;
        }

        this.router.navigate(['/login']);

        // send login notification
        this.openSnackBar('You must log in to access this page!');
    }

    resetHttpParams() {
        // resets http params
        this.http_params = `apiKey=${this.auth_token}&sessionID=${this.session_id}`

        this.httpOptions = {
            params: new HttpParams({
              fromString: this.http_params
            }),
        };
    }

    setInitialized() {
        this.service_initialized.next(true);
        this.initialized = true;
        this.config_reloaded.next(true);
    }

    reloadSubscriptions() {
        this.getAllSubscriptions().subscribe(res => {
            this.subscriptions = res['subscriptions'];
        });
    }

    adminExists() {
        return this.http.post(this.path + 'auth/adminExists', {}, this.httpOptions);
    }

    createAdminAccount(password) {
        return this.http.post(this.path + 'auth/register', {userid: 'admin',
            username: 'admin',
            password: password}, this.httpOptions);
    }

    checkAdminCreationStatus(force_show = false) {
        if (!force_show && !this.config['Advanced']['multi_user_mode']) {
            return;
        }
        this.adminExists().subscribe(res => {
            if (!res['exists']) {
                // must create admin account
                this.open_create_default_admin_dialog.next(true);
            }
        });
    }

    changeUser(change_obj) {
        return this.http.post(this.path + 'updateUser', {change_object: change_obj}, this.httpOptions);
    }

    deleteUser(uid) {
        return this.http.post(this.path + 'deleteUser', {uid: uid}, this.httpOptions);
    }

    changeUserPassword(user_uid, new_password) {
        return this.http.post(this.path + 'auth/changePassword', {user_uid: user_uid, new_password: new_password}, this.httpOptions);
    }

    getUsers() {
        return this.http.post(this.path + 'getUsers', {}, this.httpOptions);
    }

    getRoles() {
        return this.http.post(this.path + 'getRoles', {}, this.httpOptions);
    }

    setUserPermission(user_uid, permission, new_value) {
        return this.http.post(this.path + 'changeUserPermissions', {user_uid: user_uid, permission: permission, new_value: new_value},
                                                                    this.httpOptions);
    }

    setRolePermission(role_name, permission, new_value) {
        return this.http.post(this.path + 'changeRolePermissions', {role: role_name, permission: permission, new_value: new_value},
                                                                    this.httpOptions);
    }

    public openSnackBar(message: string, action: string = '') {
        this.snackBar.open(message, action, {
          duration: 2000,
        });
    }

}

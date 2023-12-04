import {Injectable, isDevMode, Inject} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import { THEMES_CONFIG } from '../themes';
import { Router, CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
    ChangeRolePermissionsRequest,
    ChangeUserPermissionsRequest,
    ConfigResponse,
    CreatePlaylistRequest,
    CreatePlaylistResponse,
    CropFileSettings,
    DeleteMp3Mp4Request,
    DeletePlaylistRequest,
    DeleteSubscriptionFileRequest,
    DeleteUserRequest,
    DownloadArchiveRequest,
    DownloadFileRequest,
    FileType,
    GenerateNewApiKeyResponse,
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
    GetRolesResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    GetUsersResponse,
    LoginRequest,
    LoginResponse,
    DownloadRequest,
    DownloadResponse,
    Playlist,
    RegisterRequest,
    RegisterResponse,
    SetConfigRequest,
    SharingToggle,
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionRequestData,
    SuccessObject,
    UpdaterStatus,
    UnsubscribeRequest,
    UnsubscribeResponse,
    UpdatePlaylistRequest,
    UpdateServerRequest,
    UpdateUserRequest,
    UserPermission,
    YesNo,
    GenerateArgsResponse,
    GetPlaylistsRequest,
    UpdateCategoryRequest,
    UpdateCategoriesRequest,
    DeleteCategoryRequest,
    CreateCategoryRequest,
    CreateCategoryResponse,
    GetAllCategoriesResponse,
    AddFileToPlaylistRequest,
    IncrementViewCountRequest,
    GetLogsRequest,
    GetLogsResponse,
    UpdateConcurrentStreamResponse,
    UpdateConcurrentStreamRequest,
    CheckConcurrentStreamRequest,
    CheckConcurrentStreamResponse,
    DownloadTwitchChatByVODIDRequest,
    DownloadTwitchChatByVODIDResponse,
    GetFullTwitchChatRequest,
    GetFullTwitchChatResponse,
    GetAllDownloadsRequest,
    TestConnectionStringRequest,
    TestConnectionStringResponse,
    TransferDBRequest,
    TransferDBResponse,
    VersionInfoResponse,
    DBInfoResponse,
    GetFileFormatsRequest,
    GetFileFormatsResponse,
    GetTaskRequest,
    GetTaskResponse,
    UpdateTaskScheduleRequest,
    UpdateTaskDataRequest,
    RestoreDBBackupRequest,
    Schedule,
    ClearDownloadsRequest,
    Category,
    UpdateFileRequest,
    Sort,
    FileTypeFilter,
    GetAllFilesRequest,
    GetAllTasksResponse,
    DeleteNotificationRequest,
    SetNotificationsToReadRequest,
    GetNotificationsResponse,
    UpdateTaskOptionsRequest,
    User,
    DeleteArchiveItemsRequest,
    GetArchivesRequest,
    GetArchivesResponse,
    ImportArchiveRequest,
    Archive,
    Subscription,
    RestartDownloadResponse,
    TaskType,
    CheckSubscriptionRequest
} from '../api-types';
import { isoLangs } from './dialogs/user-profile-dialog/locales_list';
import { Title } from '@angular/platform-browser';
import { MatDrawerMode } from '@angular/material/sidenav';
import { environment } from '../environments/environment';

@Injectable()
export class PostsService implements CanActivate {
    path = '';

    // local settings
    THEMES_CONFIG = THEMES_CONFIG;
    theme;
    card_size = 'medium';
    sidepanel_mode: MatDrawerMode = 'over';

    // auth
    auth_token = '4241b401-7236-493e-92b5-b72696b9d853';
    httpOptions: {
        params: HttpParams
    };
    http_params: string = null;
    unauthorized = false;

    debugMode = false;

    // must be reset after logout
    isLoggedIn = false;
    token = null;
    user: User = null;
    permissions = null;

    available_permissions = null;

    // behavior subjects
    reload_config = new BehaviorSubject<boolean>(false);
    config_reloaded = new BehaviorSubject<boolean>(false);
    service_initialized = new BehaviorSubject<boolean>(false);
    settings_changed = new BehaviorSubject<boolean>(false);
    open_create_default_admin_dialog = new BehaviorSubject<boolean>(false);

    files_changed = new BehaviorSubject<boolean>(false);
    playlists_changed = new BehaviorSubject<boolean>(false);

    // app status
    initialized = false;

    // global vars
    config = null;
    subscriptions: Subscription[] = null;
    categories: Category[] = null;
    sidenav = null;
    locale = isoLangs['en'];
    version_info = null;

    constructor(private http: HttpClient, private router: Router, @Inject(DOCUMENT) private document: Document,
                public snackBar: MatSnackBar, private titleService: Title) {
        console.log('PostsService Initialized...');
        this.path = this.document.location.origin + '/api/';

        if (isDevMode()) {
            this.debugMode = true;
            this.path = !environment.codespaces ? 'http://localhost:17442/api/' : `${window.location.origin.replace('4200', '17442')}/api/`;
        }

        this.http_params = `apiKey=${this.auth_token}`

        this.httpOptions = {
            params: new HttpParams({
              fromString: this.http_params
            })
        };

        const redirect_not_required = window.location.href.includes('/player') || window.location.href.includes('/login');

        // get config
        this.getConfig().subscribe(res => {
            const result = !this.debugMode ? res['config_file'] : res;
            if (result) {
                this.config = result['YoutubeDLMaterial'];
                this.titleService.setTitle(this.config['Extra']['title_top']);
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

        if (localStorage.getItem('sidepanel_mode') as MatDrawerMode) {
            this.sidepanel_mode = localStorage.getItem('sidepanel_mode') as MatDrawerMode;
        }

        if (localStorage.getItem('card_size')) {
            this.card_size = localStorage.getItem('card_size');
        }

        // localization
        const locale = localStorage.getItem('locale');
        if (!locale) {
        localStorage.setItem('locale', 'en');
        }

        if (isoLangs[locale]) {
            this.locale = isoLangs[locale];
        }

    }
    canActivate(route: ActivatedRouteSnapshot, state): Promise<boolean> {
        if (this.initialized) {
            return this._canActivate(route);
        } else {
            this.service_initialized.subscribe(init => {
                if (init) {
                    return this._canActivate(route);
                }
            });
        }
    }

    _canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
        const PATH_TO_REQUIRED_PERM = {
            settings: 'settings',
            subscriptions: 'subscriptions',
            downloads: 'downloads_manager',
            tasks: 'tasks_manager'
        }
        const required_perm = PATH_TO_REQUIRED_PERM[route.routeConfig.path];
        return required_perm ? this.hasPermission(required_perm) : true;
    }

    setTheme(theme) {
        this.theme = this.THEMES_CONFIG[theme];
    }

    getSubscriptionByID(sub_id: string): Subscription {
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
        this.getConfig().subscribe(res => {
            const result = !this.debugMode ? res['config_file'] : res;
            if (result) {
                this.config = result['YoutubeDLMaterial'];
                this.config_reloaded.next(true);
            }
        });
    }

    // tslint:disable-next-line: max-line-length
    downloadFile(url: string, type: FileType, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, additionalArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, cropFileSettings: CropFileSettings = null) {
        const body: DownloadRequest = {url: url,
            maxHeight: selectedQuality,
            customQualityConfiguration: customQualityConfiguration,
            customArgs: customArgs,
            additionalArgs: additionalArgs,
            customOutput: customOutput,
            youtubeUsername: youtubeUsername,
            youtubePassword: youtubePassword,
            type: type,
            cropFileSettings: cropFileSettings}
        return this.http.post<DownloadResponse>(this.path + 'downloadFile', body, this.httpOptions);
    }

    generateArgs(url: string, type: FileType, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, additionalArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null, cropFileSettings = null) {
        const body: DownloadRequest = {url: url,
            maxHeight: selectedQuality,
            customQualityConfiguration: customQualityConfiguration,
            customArgs: customArgs,
            additionalArgs: additionalArgs,
            customOutput: customOutput,
            youtubeUsername: youtubeUsername,
            youtubePassword: youtubePassword,
            type: type,
            cropFileSettings: cropFileSettings}
        return this.http.post<GenerateArgsResponse>(this.path + 'generateArgs', body, this.httpOptions);
    }

    getDBInfo() {
        return this.http.get<DBInfoResponse>(this.path + 'getDBInfo', this.httpOptions);
    }

    transferDB(local_to_remote) {
        const body: TransferDBRequest = {local_to_remote: local_to_remote};
        return this.http.post<TransferDBResponse>(this.path + 'transferDB', body, this.httpOptions);
    }

    testConnectionString(connection_string: string) {
        const body: TestConnectionStringRequest = {connection_string: connection_string};
        return this.http.post<TestConnectionStringResponse>(this.path + 'testConnectionString', body, this.httpOptions);
    }

    killAllDownloads() {
        return this.http.post<SuccessObject>(this.path + 'killAllDownloads', {}, this.httpOptions);
    }

    restartServer() {
        return this.http.post<SuccessObject>(this.path + 'restartServer', {}, this.httpOptions);
    }

    getConfig() {
        if (isDevMode()) {
            return this.http.get('./assets/default.json');
        } else {
            return this.http.get<ConfigResponse>(this.path + 'config', this.httpOptions);
        }
    }

    loadAsset(name) {
        return this.http.get(`./assets/${name}`);
    }

    getSupportedLocales() {
        return this.http.get('./assets/i18n/supported_locales.json');
    }

    setConfig(config) {
        const body: SetConfigRequest = {new_config_file: config};
        return this.http.post<SuccessObject>(this.path + 'setConfig', body, this.httpOptions);
    }

    deleteFile(uid: string, blacklistMode = false) {
        const body: DeleteMp3Mp4Request = {uid: uid, blacklistMode: blacklistMode}
        return this.http.post(this.path + 'deleteFile', body, this.httpOptions);
    }

    getMp3s() {
        return this.http.get<GetMp3sResponse>(this.path + 'getMp3s', this.httpOptions);
    }

    getMp4s() {
        return this.http.get<GetMp4sResponse>(this.path + 'getMp4s', this.httpOptions);
    }

    getFile(uid: string, uuid: string = null) {
        const body: GetFileRequest = {uid: uid, uuid: uuid};
        return this.http.post<GetFileResponse>(this.path + 'getFile', body, this.httpOptions);
    }

    getAllFiles(sort: Sort = null, range: number[] = null, text_search: string = null, file_type_filter: FileTypeFilter = FileTypeFilter.BOTH, favorite_filter = false, sub_id: string = null) {
        const body: GetAllFilesRequest = {sort: sort, range: range, text_search: text_search, file_type_filter: file_type_filter, favorite_filter: favorite_filter, sub_id: sub_id};
        return this.http.post<GetAllFilesResponse>(this.path + 'getAllFiles', body, this.httpOptions);
    }

    updateFile(uid: string, change_obj: Object) {
        const body: UpdateFileRequest = {uid: uid, change_obj: change_obj};
        return this.http.post<SuccessObject>(this.path + 'updateFile', body, this.httpOptions);
    }

    downloadFileFromServer(uid: string, uuid: string = null) {
        const body: DownloadFileRequest = {
            uid: uid,
            uuid: uuid
        };
        return this.http.post(this.path + 'downloadFileFromServer', body, {responseType: 'blob', params: this.httpOptions.params});
    }

    getFullTwitchChat(id, type, uuid = null, sub = null) {
        const body: GetFullTwitchChatRequest = {id: id, type: type, uuid: uuid, sub: sub};
        return this.http.post<GetFullTwitchChatResponse>(this.path + 'getFullTwitchChat', body, this.httpOptions);
    }

    downloadTwitchChat(id, type, vodId, uuid = null, sub = null) {
        const body: DownloadTwitchChatByVODIDRequest = {id: id, type: type, vodId: vodId, uuid: uuid, sub: sub};
        return this.http.post<DownloadTwitchChatByVODIDResponse>(this.path + 'downloadTwitchChatByVODID', body, this.httpOptions);
    }

    downloadPlaylistFromServer(playlist_id, uuid = null) {
        const body: DownloadFileRequest = {uuid: uuid, playlist_id: playlist_id};
        return this.http.post(this.path + 'downloadFileFromServer', body, {responseType: 'blob', params: this.httpOptions.params});
    }

    downloadSubFromServer(sub_id, uuid = null) {
        const body: DownloadFileRequest = {uuid: uuid, sub_id: sub_id};
        return this.http.post(this.path + 'downloadFileFromServer', body, {responseType: 'blob', params: this.httpOptions.params});

    }

    checkConcurrentStream(uid) {
        const body: CheckConcurrentStreamRequest = {uid: uid};
        return this.http.post<CheckConcurrentStreamResponse>(this.path + 'checkConcurrentStream', body, this.httpOptions);
    }

    updateConcurrentStream(uid, playback_timestamp, unix_timestamp, playing) {
        const body: UpdateConcurrentStreamRequest = {uid: uid,
            playback_timestamp: playback_timestamp,
            unix_timestamp: unix_timestamp,
            playing: playing};
        return this.http.post<UpdateConcurrentStreamResponse>(this.path + 'updateConcurrentStream', body, this.httpOptions);
    }

    uploadCookiesFile(cookiesFile: File, cookiesFilePath: string) {
        const formData = new FormData()
        formData.append('cookies', cookiesFile, cookiesFilePath);
        // const body: UploadCookiesRequest = formData;
        return this.http.post<SuccessObject>(this.path + 'uploadCookies', formData, this.httpOptions);
    }

    downloadArchive(type: FileType, sub_id: string) {
        const body: DownloadArchiveRequest = {type: type, sub_id: sub_id};
        return this.http.post(this.path + 'downloadArchive', body, {responseType: 'blob', params: this.httpOptions.params});
    }

    getArchives(type: FileType = null, sub_id: string = null) {
        const body: GetArchivesRequest = {type: type, sub_id: sub_id};
        return this.http.post<GetArchivesResponse>(this.path + 'getArchives', body, this.httpOptions);
    }

    importArchive(archive_base64: string, type: FileType, sub_id: string = null) {
        const body: ImportArchiveRequest = {archive: archive_base64, type: type, sub_id: sub_id}
        return this.http.post<SuccessObject>(this.path + 'importArchive', body, this.httpOptions);
    }

    deleteArchiveItems(archives: Archive[]) {
        const body: DeleteArchiveItemsRequest = {archives: archives};
        return this.http.post<SuccessObject>(this.path + 'deleteArchiveItems', body, this.httpOptions);
    }

    getFileFormats(url: string) {
        const body: GetFileFormatsRequest = {url: url};
        return this.http.post<GetFileFormatsResponse>(this.path + 'getFileFormats', body, this.httpOptions);
    }

    getLogs(lines = 50) {
        const body: GetLogsRequest = {lines: lines};
        return this.http.post<GetLogsResponse>(this.path + 'logs', body, this.httpOptions);
    }

    clearAllLogs() {
        return this.http.post<SuccessObject>(this.path + 'clearAllLogs', {}, this.httpOptions);
    }

    generateNewAPIKey() {
        return this.http.post<GenerateNewApiKeyResponse>(this.path + 'generateNewAPIKey', {}, this.httpOptions);
    }

    enableSharing(uid: string, is_playlist: boolean) {
        const body: SharingToggle = {uid: uid, is_playlist: is_playlist};
        return this.http.post<SuccessObject>(this.path + 'enableSharing', body, this.httpOptions);
    }

    disableSharing(uid: string, is_playlist: boolean) {
        const body: SharingToggle = {uid: uid, is_playlist: is_playlist};
        return this.http.post<SuccessObject>(this.path + 'disableSharing', body, this.httpOptions);
    }

    createPlaylist(playlistName: string, uids: string[], thumbnailURL: string) {
        const body: CreatePlaylistRequest = {playlistName: playlistName,
            uids: uids,
            thumbnailURL: thumbnailURL};
        return this.http.post<CreatePlaylistResponse>(this.path + 'createPlaylist', body, this.httpOptions);
    }

    getPlaylist(playlist_id: string, uuid: string = null, include_file_metadata: boolean = false) {
        const body: GetPlaylistRequest = {playlist_id: playlist_id,
            include_file_metadata: include_file_metadata, uuid: uuid};
        return this.http.post<GetPlaylistResponse>(this.path + 'getPlaylist', body, this.httpOptions);
    }

    getPlaylists(include_categories = false) {
        return this.http.post<GetPlaylistsRequest>(this.path + 'getPlaylists', {include_categories: include_categories}, this.httpOptions);
    }

    incrementViewCount(file_uid, sub_id, uuid) {
        const body: IncrementViewCountRequest = {file_uid: file_uid, sub_id: sub_id, uuid: uuid};
        return this.http.post<SuccessObject>(this.path + 'incrementViewCount', body, this.httpOptions);
    }

    updatePlaylist(playlist: Playlist) {
        const body: UpdatePlaylistRequest = {playlist: playlist};
        return this.http.post<SuccessObject>(this.path + 'updatePlaylist', body, this.httpOptions);
    }

    removePlaylist(playlist_id: string) {
        const body: DeletePlaylistRequest = {playlist_id: playlist_id};
        return this.http.post<SuccessObject>(this.path + 'deletePlaylist', body, this.httpOptions);
    }

    createSubscription(url, name, timerange = null, maxQuality = 'best', audioOnly = false, customArgs: string = null, customFileOutput: string = null) {
        const body: SubscribeRequest = {url: url, name: name, timerange: timerange, maxQuality: maxQuality,
            audioOnly: audioOnly, customArgs: customArgs, customFileOutput: customFileOutput};
        return this.http.post<SubscribeResponse>(this.path + 'subscribe', body, this.httpOptions);
    }
    
    addFileToPlaylist(playlist_id, file_uid) {
        const body: AddFileToPlaylistRequest = {playlist_id: playlist_id, file_uid: file_uid}
        return this.http.post<SuccessObject>(this.path + 'addFileToPlaylist', body, this.httpOptions);
    }

    // categories

    getAllCategories() {
        return this.http.post<GetAllCategoriesResponse>(this.path + 'getAllCategories', {}, this.httpOptions);
    }

    createCategory(name) {
        const body: CreateCategoryRequest = {name: name};
        return this.http.post<CreateCategoryResponse>(this.path + 'createCategory', body, this.httpOptions);
    }

    deleteCategory(category_uid) {
        const body: DeleteCategoryRequest = {category_uid: category_uid};
        return this.http.post<SuccessObject>(this.path + 'deleteCategory', body, this.httpOptions);
    }

    updateCategory(category) {
        const body: UpdateCategoryRequest = {category: category};
        return this.http.post<SuccessObject>(this.path + 'updateCategory', body, this.httpOptions);
    }

    updateCategories(categories) {
        const body: UpdateCategoriesRequest = {categories: categories};
        return this.http.post<SuccessObject>(this.path + 'updateCategories', body, this.httpOptions);
    }

    reloadCategories() {
        this.getAllCategories().subscribe(res => {
            this.categories = res['categories'];
        });
    }

    updateSubscription(subscription) {
        delete subscription['videos'];
        return this.http.post<SuccessObject>(this.path + 'updateSubscription', {subscription: subscription}, this.httpOptions);
    }

    checkSubscription(sub_id: string) {
        const body: CheckSubscriptionRequest = {sub_id: sub_id};
        return this.http.post<SuccessObject>(this.path + 'checkSubscription', body, this.httpOptions);
    }

    cancelCheckSubscription(sub_id: string) {
        const body: CheckSubscriptionRequest = {sub_id: sub_id};
        return this.http.post<SuccessObject>(this.path + 'cancelCheckSubscription', body, this.httpOptions);
    }

    unsubscribe(sub_id: string, deleteMode = false) {
        const body: UnsubscribeRequest = {sub_id: sub_id, deleteMode: deleteMode};
        return this.http.post<UnsubscribeResponse>(this.path + 'unsubscribe', body, this.httpOptions)
    }

    deleteSubscriptionFile(file_uid: string, deleteForever: boolean) {
        const body: DeleteSubscriptionFileRequest = {file_uid: file_uid, deleteForever: deleteForever};
        return this.http.post<SuccessObject>(this.path + 'deleteSubscriptionFile', body, this.httpOptions)
    }

    getSubscription(id: string, name: string = null) {
        const body: GetSubscriptionRequest = {id: id, name: name};
        return this.http.post<GetSubscriptionResponse>(this.path + 'getSubscription', body, this.httpOptions);
    }

    getAllSubscriptions() {
        return this.http.post<GetAllSubscriptionsResponse>(this.path + 'getSubscriptions', {}, this.httpOptions);
    }

    getCurrentDownloads(uids: Array<string> = null) {
        const body: GetAllDownloadsRequest = {uids: uids};
        return this.http.post<GetAllDownloadsResponse>(this.path + 'downloads', body, this.httpOptions);
    }

    getCurrentDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<GetDownloadResponse>(this.path + 'download', body, this.httpOptions);
    }

    pauseDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<SuccessObject>(this.path + 'pauseDownload', body, this.httpOptions);
    }

    pauseAllDownloads() {
        return this.http.post<SuccessObject>(this.path + 'pauseAllDownloads', {}, this.httpOptions);
    }

    resumeDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<SuccessObject>(this.path + 'resumeDownload', body, this.httpOptions);
    }

    resumeAllDownloads() {
        return this.http.post<SuccessObject>(this.path + 'resumeAllDownloads', {}, this.httpOptions);
    }

    restartDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<RestartDownloadResponse>(this.path + 'restartDownload', body, this.httpOptions);
    }

    cancelDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<SuccessObject>(this.path + 'cancelDownload', body, this.httpOptions);
    }

    clearDownload(download_uid: string) {
        const body: GetDownloadRequest = {download_uid: download_uid};
        return this.http.post<SuccessObject>(this.path + 'clearDownload', body, this.httpOptions);
    }

    clearDownloads(clear_finished: boolean, clear_paused: boolean, clear_errors: boolean) {
        const body: ClearDownloadsRequest = {clear_finished: clear_finished, clear_paused: clear_paused, clear_errors: clear_errors};
        return this.http.post<SuccessObject>(this.path + 'clearDownloads', body, this.httpOptions);
    }

    getTasks() {
        return this.http.post<GetAllTasksResponse>(this.path + 'getTasks', {}, this.httpOptions);
    }

    resetTasks() {
        return this.http.post<SuccessObject>(this.path + 'resetTasks', {}, this.httpOptions);
    }

    getTask(task_key: TaskType) {
        const body: GetTaskRequest = {task_key: task_key};
        return this.http.post<GetTaskResponse>(this.path + 'getTask', body, this.httpOptions);
    }

    runTask(task_key: TaskType) {
        const body: GetTaskRequest = {task_key: task_key};
        return this.http.post<SuccessObject>(this.path + 'runTask', body, this.httpOptions);
    }

    confirmTask(task_key: TaskType) {
        const body: GetTaskRequest = {task_key: task_key};
        return this.http.post<SuccessObject>(this.path + 'confirmTask', body, this.httpOptions);
    }

    updateTaskSchedule(task_key: TaskType, schedule: Schedule) {
        const body: UpdateTaskScheduleRequest = {task_key: task_key, new_schedule: schedule};
        return this.http.post<SuccessObject>(this.path + 'updateTaskSchedule', body, this.httpOptions);
    }

    updateTaskData(task_key: TaskType, data: any) {
        const body: UpdateTaskDataRequest = {task_key: task_key, new_data: data};
        return this.http.post<SuccessObject>(this.path + 'updateTaskData', body, this.httpOptions);
    }

    updateTaskOptions(task_key: TaskType, options: any) {
        const body: UpdateTaskOptionsRequest = {task_key: task_key, new_options: options};
        return this.http.post<SuccessObject>(this.path + 'updateTaskOptions', body, this.httpOptions);
    }

    getDBBackups() {
        return this.http.post<SuccessObject>(this.path + 'getDBBackups', {}, this.httpOptions);
    }

    restoreDBBackup(file_name: string) {
        const body: RestoreDBBackupRequest = {file_name: file_name};
        return this.http.post<SuccessObject>(this.path + 'restoreDBBackup', body, this.httpOptions);
    }

    getVersionInfo() {
        return this.http.get<VersionInfoResponse>(this.path + 'versionInfo', this.httpOptions);
    }

    updateServer(tag: string) {
        const body: UpdateServerRequest = {tag: tag};
        return this.http.post<SuccessObject>(this.path + 'updateServer', body, this.httpOptions);
    }

    getUpdaterStatus() {
        return this.http.get<UpdaterStatus>(this.path + 'updaterStatus', this.httpOptions);
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
    login(username: string, password: string) {
        const body: LoginRequest = {username: username, password: password};
        return this.http.post<LoginResponse>(this.path + 'auth/login', body, this.httpOptions);
    }

    // user methods
    jwtAuth() {
        const call = this.http.post(this.path + 'auth/jwtAuth', {}, this.httpOptions);
        call.subscribe(res => {
            if (res['token']) {
                this.afterLogin(res['user'], res['token'], res['permissions'], res['available_permissions']);
            }
        }, err => {
            if (err === 'Unauthorized') {
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

    hasPermission(permission) {
        // assume not logged in users never have permission
        if (this.config.Advanced.multi_user_mode && !this.isLoggedIn) return false;
        return this.config.Advanced.multi_user_mode ? this.permissions.includes(permission) : true;
    }

    // user methods
    register(username: string, password: string) {
        const body: RegisterRequest = {userid: username,
            username: username,
            password: password}
        const call = this.http.post<RegisterResponse>(this.path + 'auth/register', body, this.httpOptions);
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
        this.http_params = `apiKey=${this.auth_token}`

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

    createAdminAccount(password: string) {
        const body: RegisterRequest = {userid: 'admin',
        username: 'admin',
        password: password};
        return this.http.post<RegisterResponse>(this.path + 'auth/register', body, this.httpOptions);
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

    changeUser(change_obj: UpdateUserRequest['change_object']) {
        const body: UpdateUserRequest = {change_object: change_obj};
        return this.http.post<SuccessObject>(this.path + 'updateUser', body, this.httpOptions);
    }

    deleteUser(uid: string) {
        const body: DeleteUserRequest = {uid: uid};
        return this.http.post<SuccessObject>(this.path + 'deleteUser', body, this.httpOptions);
    }

    changeUserPassword(user_uid, new_password) {
        return this.http.post(this.path + 'auth/changePassword', {user_uid: user_uid, new_password: new_password}, this.httpOptions);
    }

    getUsers(): Observable<GetUsersResponse> {
        return this.http.post<GetUsersResponse>(this.path + 'getUsers', {}, this.httpOptions);
    }

    getRoles() {
        return this.http.post<GetRolesResponse>(this.path + 'getRoles', {}, this.httpOptions);
    }

    setUserPermission(user_uid: string, permission: UserPermission, new_value: YesNo) {
        const body: ChangeUserPermissionsRequest = {user_uid: user_uid, permission: permission, new_value: new_value};
        return this.http.post<SuccessObject>(this.path + 'changeUserPermissions', body,
                                                                    this.httpOptions);
    }

    setRolePermission(role_name: string, permission: UserPermission, new_value: YesNo) {
        const body: ChangeRolePermissionsRequest = {role: role_name, permission: permission, new_value: new_value};
        return this.http.post<SuccessObject>(this.path + 'changeRolePermissions', body,
                                                                    this.httpOptions);
    }

    getSponsorBlockDataForVideo(id_hash) {
        const sponsor_block_api_path = 'https://sponsor.ajay.app/api/';
        return this.http.get(sponsor_block_api_path + `skipSegments/${id_hash}`);
    }

    // notifications

    getNotifications(): Observable<GetNotificationsResponse> {
        return this.http.post<GetNotificationsResponse>(this.path + 'getNotifications', {},
                                                                    this.httpOptions);
    }

    setNotificationsToRead(uids: string[]): Observable<SuccessObject> {
        const body: SetNotificationsToReadRequest = {uids: uids};
        return this.http.post<SuccessObject>(this.path + 'setNotificationsToRead', body,
                                                                    this.httpOptions);
    }

    deleteNotification(uid: string): Observable<SuccessObject> {
        const body: DeleteNotificationRequest = {uid: uid};
        return this.http.post<SuccessObject>(this.path + 'deleteNotification', body,
                                                                    this.httpOptions);
    }
    
    deleteAllNotifications(): Observable<SuccessObject> {
        return this.http.post<SuccessObject>(this.path + 'deleteAllNotifications', {},
                                                                    this.httpOptions);
    }

    public openSnackBar(message: string, action = ''): void {
        this.snackBar.open(message, action, {
          duration: 2000,
        });
    }

}

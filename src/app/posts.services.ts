import {Injectable, isDevMode, Inject} from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpResponseBase } from '@angular/common/http';
import config from '../assets/default.json';
import 'rxjs/add/operator/map';
import { Observable } from 'rxjs/Observable';
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
                                                    youtubePassword: youtubePassword});
    }

    // tslint:disable-next-line: max-line-length
    makeMP4(url: string, selectedQuality: string, customQualityConfiguration: string, customArgs: string = null, customOutput: string = null, youtubeUsername: string = null, youtubePassword: string = null) {
        return this.http.post(this.path + 'tomp4', {url: url,
                                                    selectedHeight: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration,
                                                    customArgs: customArgs,
                                                    customOutput: customOutput,
                                                    youtubeUsername: youtubeUsername,
                                                    youtubePassword: youtubePassword});
    }

    getFileStatusMp3(name: string) {
        return this.http.post(this.path + 'fileStatusMp3', {name: name});
    }

    getFileStatusMp4(name: string) {
        return this.http.post(this.path + 'fileStatusMp4', {name: name});
    }

    loadNavItems() {
        if (isDevMode()) {
            return this.http.get('./assets/default.json');
        } else {
            return this.http.get(this.path + 'config');
        }
    }

    setConfig(config) {
        return this.http.post(this.path + 'setConfig', {new_config_file: config});
    }

    deleteFile(name: string, isAudio: boolean) {
        if (isAudio) {
            return this.http.post(this.path + 'deleteMp3', {name: name});
        } else {
            return this.http.post(this.path + 'deleteMp4', {name: name});
        }
    }

    getMp3s() {
        return this.http.post(this.path + 'getMp3s', {});
    }

    getMp4s() {
        return this.http.post(this.path + 'getMp4s', {});
    }

    downloadFileFromServer(fileName, type, outputName = null) {
        return this.http.post(this.path + 'downloadFile', {fileNames: fileName,
                                                            type: type,
                                                            is_playlist: Array.isArray(fileName),
                                                            outputName: outputName},
                                                          {responseType: 'blob'});
    }

    downloadArchive(sub) {
        return this.http.post(this.path + 'downloadArchive', {sub: sub}, {responseType: 'blob'});
    }

    getFileInfo(fileNames, type, urlMode) {
        return this.http.post(this.path + 'getVideoInfos', {fileNames: fileNames, type: type, urlMode: urlMode});
    }

    createPlaylist(playlistName, fileNames, type, thumbnailURL) {
        return this.http.post(this.path + 'createPlaylist', {playlistName: playlistName,
                                                            fileNames: fileNames,
                                                            type: type,
                                                            thumbnailURL: thumbnailURL});
    }

    updatePlaylist(playlistID, fileNames, type) {
        return this.http.post(this.path + 'updatePlaylist', {playlistID: playlistID,
                                                            fileNames: fileNames,
                                                            type: type});
    }

    removePlaylist(playlistID, type) {
        return this.http.post(this.path + 'deletePlaylist', {playlistID: playlistID, type: type});
    }

    createSubscription(url, name, timerange = null) {
        return this.http.post(this.path + 'subscribe', {url: url, name: name, timerange: timerange})
    }

    unsubscribe(sub, deleteMode = false) {
        return this.http.post(this.path + 'unsubscribe', {sub: sub, deleteMode: deleteMode})
    }

    deleteSubscriptionFile(sub, file, deleteForever) {
        return this.http.post(this.path + 'deleteSubscriptionFile', {sub: sub, file: file, deleteForever: deleteForever})
    }

    getSubscription(id) {
        return this.http.post(this.path + 'getSubscription', {id: id});
    }

    getAllSubscriptions() {
        return this.http.post(this.path + 'getAllSubscriptions', {});
    }
}




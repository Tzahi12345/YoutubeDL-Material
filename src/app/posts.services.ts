import {Injectable, isDevMode} from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpResponseBase } from '@angular/common/http';
import config from '../assets/default.json';
import 'rxjs/add/operator/map';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import { THEMES_CONFIG } from '../themes';

@Injectable()
export class PostsService {
    path = '';
    audioFolder = '';
    videoFolder = '';
    startPath = 'http://localhost:17442/';
    startPathSSL = 'https://localhost:17442/'
    handShakeComplete = false;
    THEMES_CONFIG = THEMES_CONFIG;
    theme;

    constructor(private http: HttpClient) {
        console.log('PostsService Initialized...');
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

    makeMP3(url: string, selectedQuality: string, customQualityConfiguration: string) {
        return this.http.post(this.path + 'tomp3', {url: url,
                                                    maxBitrate: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration});
    }

    makeMP4(url: string, selectedQuality: string, customQualityConfiguration: string) {
        return this.http.post(this.path + 'tomp4', {url: url,
                                                    selectedHeight: selectedQuality,
                                                    customQualityConfiguration: customQualityConfiguration});
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
        }
        const locations = window.location.href.split('#');
        const current_location = locations[0];
        return this.http.get(current_location + 'backend/config/default.json');
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
}




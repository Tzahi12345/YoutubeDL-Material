import {Injectable, isDevMode} from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpResponseBase } from '@angular/common/http';
import config from '../assets/default.json';
import 'rxjs/add/operator/map';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';

@Injectable()
export class PostsService {
    path = '';
    audioFolder = '';
    videoFolder = '';
    startPath = 'http://localhost:17442/';
    startPathSSL = 'https://localhost:17442/'
    handShakeComplete = false;

    constructor(private http: HttpClient) {
        console.log('PostsService Initialized...');
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
        console.log('Config location: ' + window.location.href + 'backend/config/default.json');
        return this.http.get(window.location.href + 'backend/config/default.json');
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

    downloadFileFromServer(fileName, type) {
        return this.http.post(this.path + 'downloadFile', {fileName: fileName, type: type}, {responseType: 'blob'});
    }

    getFileInfo(fileNames, type, urlMode) {
        return this.http.post(this.path + 'getVideoInfos', {fileNames: fileNames, type: type, urlMode: urlMode});
    }
}




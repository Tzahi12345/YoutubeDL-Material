import {Injectable} from '@angular/core';
import {Http} from '@angular/http';
import 'rxjs/add/operator/map';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';

@Injectable()
export class PostsService {
    path: string = "";
    audioFolder: string = "";
    videoFolder: string = "";
    startPath: string = "http://localhost:17442/";
    startPathSSL: string = "https://localhost:17442/"
    handShakeComplete: boolean = false;

    constructor(private http: Http){
        console.log('PostsService Initialized...');
    }

    startHandshake(url: string): Observable<string>
    {
        return this.http.get(url + "geturl")
            .map(res => res.json());
    }

    startHandshakeSSL(url: string): Observable<string>
    {
        return this.http.get(url + "geturl")
            .map(res => res.json());
    }

    getVideoFolder(): Observable<string>
    {
        return this.http.get(this.startPath + "videofolder")
            .map(res => res.json());
    }

    getAudioFolder(): Observable<string>
    {
        return this.http.get(this.startPath + "audiofolder")
            .map(res => res.json());
    }

    makeMP3(url: string): Observable<string>
    {
        return this.http.post(this.path + "tomp3",{url: url})
            .map(res => res.json());
    }

    makeMP4(url: string): Observable<string>
    {
        return this.http.post(this.path + "tomp4",{url: url})
            .map(res => res.json());
    }

    getFileStatusMp3(name: string): Observable<any> {
        return this.http.post(this.path + "fileStatusMp3",{name: name})
            .map(res => res.json());
    }

    getFileStatusMp4(name: string): Observable<any> {
        return this.http.post(this.path + "fileStatusMp4",{name: name})
            .map(res => res.json());
    }

    loadNavItems() {
        console.log("Config location: " + window.location.href + "backend/config/default.json");
        return this.http.get(window.location.href + "backend/config/default.json")
                        .map(res => res.json());
    }

    deleteFile(name: string, isAudio: boolean)
    {
        if (isAudio)
        {
            return this.http.post(this.path + "deleteMp3",{name: name})
                .map(res => res.json());
        }
        else
        {
            return this.http.post(this.path + "deleteMp4",{name: name})
                .map(res => res.json());
        }
    }

    getMp3s()
    {
        return this.http.post(this.path + "getMp3s", {})
            .map(res => res.json());
    }

    getMp4s()
    {
        return this.http.post(this.path + "getMp4s", {})
            .map(res => res.json());
    }
}




import { Component, OnInit } from '@angular/core';
import {PostsService} from './posts.services';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {MatSnackBar} from '@angular/material';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/toPromise';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  determinateProgress: boolean = false;
  downloadingfile: boolean = false;
  audioOnly: boolean;
  urlError: boolean = false;
  path: string = '';
  url: string = '';
  exists: string = "";
  topBarTitle: string = "Youtube Downloader";
  percentDownloaded: number;
  constructor(private postsService: PostsService, public snackBar: MatSnackBar) { 
    this.audioOnly = true;

    

    this.postsService.loadNavItems().subscribe(result => { // loads settings
      var backendUrl = result.YoutubeDLMaterial.Host.backendurl;
      this.topBarTitle = result.YoutubeDLMaterial.Extra.title_top;

      this.postsService.path = backendUrl;
      this.postsService.startPath = backendUrl;
      this.postsService.startPathSSL = backendUrl;
    },
    error => {
      console.log(error);
    });
  }

  urlForm = new FormControl('', [Validators.required]);

  doHandshake(url: string) {
    this.postsService.startHandshake(url).subscribe(theurl => {
      this.postsService.path = theurl;
      this.postsService.handShakeComplete = true;
      console.log("Handshake complete!");
    },
    error => {
      console.log("Initial handshake failed on http.");
      this.doHandshakeSSL(url);
    });
  }

  doHandshakeSSL(url: string) {
    this.postsService.startHandshakeSSL(url).subscribe(theurl => {
      this.postsService.path = theurl;
      this.postsService.handShakeComplete = true;
      console.log("Handshake complete!");
    },
    error => {
      console.log("Initial handshake failed on https too! Make sure port 17442 is open.");
      this.postsService.handShakeComplete = false;
    });
  }

  ngOnInit() {
  }

  downloadHelperMp3(name: string)
  {
    this.postsService.getFileStatusMp3(name).subscribe(fileExists => {
      var exists = fileExists;
      this.exists = exists[0];
      if (exists[0] == "failed")
      {
        var percent = exists[2];
        console.log(percent);
        if (percent > 0.30)
        {
          this.determinateProgress = true;
          this.percentDownloaded = percent*100;
        }
        setTimeout(() => this.downloadHelperMp3(name), 500);
      }
      else
      {
        window.location.href = this.exists;
      }
    });
    
  }

  downloadHelperMp4(name: string)
  {
    this.postsService.getFileStatusMp4(name).subscribe(fileExists => {
      var exists = fileExists;
      this.exists = exists[0];
      if (exists[0] == "failed")
      {
        var percent = exists[2];
        if (percent > 0.30)
        {
          this.determinateProgress = true;
          this.percentDownloaded = percent*100;
        }
        setTimeout(() => this.downloadHelperMp4(name), 500);
      }
      else
      {
        window.location.href = this.exists;
      }
    });
    
  }

  downloadClicked()
  {
    if (this.ValidURL(this.url))
    {
      this.urlError = false;
      this.path = "";
      
      if (this.audioOnly)
      {
        this.downloadingfile = true;
        this.postsService.makeMP3(this.url).subscribe(posts => {
          this.path = posts;
          if (this.path != "-1")
          {
            this.downloadHelperMp3(this.path);
          }
        },
        error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar("Download failed!", "OK.");
        });
      }
      else
      {
        this.downloadingfile = true;
        this.postsService.makeMP4(this.url).subscribe(posts => {
          this.path = posts;
          if (this.path != "-1")
          {
            this.downloadHelperMp4(this.path);
          }
        },
        error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar("Download failed!", "OK.");
      });
      }
    }
    else
    {
      this.urlError = true;
    }
  }

  ValidURL(str) {
    var strRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
    var re=new RegExp(strRegex);
    return re.test(str);
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }
}


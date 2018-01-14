import { Component, OnInit } from '@angular/core';
import {PostsService} from './posts.services';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/toPromise';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  downloadingmp3: boolean = false;
  audioOnly: boolean;
  urlError: boolean = false;
  path: string = '';
  url: string = '';
  exists: boolean = false;
  topBarTitle: string = "Youtube Downloader";
  constructor(private postsService: PostsService) { 
    this.audioOnly = true;

    // starts handshake
    this.doHandshake();
  }

  urlForm = new FormControl('', [Validators.required]);

  doHandshake() {
    this.postsService.startHandshake().subscribe(url => {
      this.postsService.path = "http://" + url;
      this.postsService.handShakeComplete = true;
      console.log("Handshake complete!");
    },
    error => {
      console.log("Initial handshake failed, make sure port 17442 is open!");
      this.postsService.handShakeComplete = false;
    });
  }

  ngOnInit() {
  }

  downloadHelperMp3(name: string)
  {
    this.postsService.getFileStatusMp3(name).subscribe(fileExists => {
      this.exists = fileExists;
      if (this.exists == false)
      {
        this.downloadHelperMp3(name);
      }
      else
      {
        window.location.href = 'https://grynsztein.com/audio/' + this.path + ".mp3";
      }
    });
    
  }

  downloadHelperMp4(name: string)
  {
    this.postsService.getFileStatusMp4(name).subscribe(fileExists => {
      this.exists = fileExists;
      if (this.exists == false)
      {
        this.downloadHelperMp4(name);
      }
      else
      {
        window.location.href = 'https://grynsztein.com/video/' + this.path + ".mp4";
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
        this.downloadingmp3 = true;
        this.postsService.makeMP3(this.url).subscribe(posts => {
          this.path = posts;
          if (this.path != "-1")
          {
            this.downloadHelperMp3(this.path);
          }
        });
        
      }
      else
      {
        this.downloadingmp3 = true;
        this.postsService.makeMP4(this.url).subscribe(posts => {
          this.path = posts;
          if (this.path != "-1")
          {
            this.downloadHelperMp4(this.path);
          }
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
}

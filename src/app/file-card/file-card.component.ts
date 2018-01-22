import { Component, OnInit, Input } from '@angular/core';
import {PostsService} from '../posts.services';
import {MatSnackBar} from '@angular/material';
import {AppComponent} from '../app.component';

@Component({
  selector: 'app-file-card',
  templateUrl: './file-card.component.html',
  styleUrls: ['./file-card.component.css']
})
export class FileCardComponent implements OnInit {

  @Input() title:string;
  @Input() length:string;
  @Input() name:string;
  @Input() thumbnailURL: string;
  @Input() isAudio: boolean = true;

  constructor(private postsService: PostsService, public snackBar: MatSnackBar, private appComponent: AppComponent) { }

  ngOnInit() {
  }

  deleteFile()
  {
    this.postsService.deleteFile(this.name, this.isAudio).subscribe(result => {
      if (result == true)
      {
        this.openSnackBar("Delete success!", "OK.");
        if (this.isAudio)
          this.appComponent.removeFromMp3(name);
        else
          this.appComponent.removeFromMp4(name);
      }
      else
      {
        this.openSnackBar("Delete failed!", "OK.");
      }
    });
  }

  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}

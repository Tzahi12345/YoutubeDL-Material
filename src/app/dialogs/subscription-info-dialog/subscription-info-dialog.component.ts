import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-subscription-info-dialog',
  templateUrl: './subscription-info-dialog.component.html',
  styleUrls: ['./subscription-info-dialog.component.scss']
})
export class SubscriptionInfoDialogComponent implements OnInit {

  sub = null;
  unsubbedEmitter = null;

  constructor(public dialogRef: MatDialogRef<SubscriptionInfoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, private postsService: PostsService) { }

  ngOnInit() {
    if (this.data) {
      this.sub = this.data.sub;
      this.unsubbedEmitter = this.data.unsubbedEmitter;
    }
  }

  unsubscribe() {
    this.postsService.unsubscribe(this.sub, true).subscribe(res => {
      this.unsubbedEmitter.emit(true);
      this.dialogRef.close();
    });
  }

  downloadArchive() {
    this.postsService.downloadArchive(this.sub).subscribe(res => {
      const blob: Blob = res;
      saveAs(blob, 'archive.txt');
    });
  }

}

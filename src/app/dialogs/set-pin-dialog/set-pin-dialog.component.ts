import { Component } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-set-pin-dialog',
  templateUrl: './set-pin-dialog.component.html',
  styleUrls: ['./set-pin-dialog.component.scss']
})
export class SetPinDialogComponent {
  pin: string;
  constructor(private postsService: PostsService) {
    
  }

  setPin() {
    this.postsService.setPin(this.pin).subscribe(res => {
      if (res['success']) {
        this.postsService.openSnackBar($localize`Successfully set pin!`);
      }
    });
  }
}

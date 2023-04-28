import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-pin-login',
  templateUrl: './pin-login-dialog.component.html',
  styleUrls: ['./pin-login-dialog.component.scss']
})
export class PinLoginComponent {
  pin: string;
  enterClicked = false;

  constructor(private postsService: PostsService, private dialogRef: MatDialogRef<PinLoginComponent>) {
  }

  pinLogin() {
    this.enterClicked = true;
    this.postsService.pinLogin(this.pin).subscribe(res => {
      this.enterClicked = false;
      if (!res['pin_token']) {
        this.postsService.openSnackBar($localize`Pin failed!`);
      } else {
        this.postsService.httpOptions.params = this.postsService.httpOptions.params.set('pin_token', res['pin_token']);
      }
      this.dialogRef.close(res['pin_token']);
    }, err => {
      this.enterClicked = false;
      this.postsService.openSnackBar($localize`Pin failed!`);
      console.error(err);
      this.dialogRef.close(false);
    });
  }
}

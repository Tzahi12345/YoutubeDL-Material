import { Component, OnInit, Inject } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-check-or-set-pin-dialog',
  templateUrl: './check-or-set-pin-dialog.component.html',
  styleUrls: ['./check-or-set-pin-dialog.component.scss']
})
export class CheckOrSetPinDialogComponent implements OnInit {

  pinSetChecked = false;
  pinSet = true;
  resetMode = false;
  dialog_title = '';
  input_placeholder = null;
  input = '';
  button_label = '';

  constructor(private postsService: PostsService, @Inject(MAT_DIALOG_DATA) public data: any,
              public dialogRef: MatDialogRef<CheckOrSetPinDialogComponent>, private snackBar: MatSnackBar) { }

  ngOnInit() {
    if (this.data) {
      console.log('is reset mode');
      this.resetMode = this.data.resetMode;
    }

    if (this.resetMode) {
      this.pinSetChecked = true;
      this.notSetLogic();
    } else {
      this.isPinSet();
    }
  }

  isPinSet() {
    this.postsService.isPinSet().subscribe(res => {
      this.pinSetChecked = true;
      if (res['is_set']) {
        this.isSetLogic();
      } else {
        this.notSetLogic();
      }
    });
  }

  isSetLogic() {
    this.pinSet = true;
    this.dialog_title = 'Pin Required';
    this.input_placeholder = 'Pin';
    this.button_label = 'Submit'
  }

  notSetLogic() {
    this.pinSet = false;
    this.dialog_title = 'Set your pin';
    this.input_placeholder = 'New pin';
    this.button_label = 'Set Pin'
  }

  doAction() {
    // pin set must have been checked, and input must not be empty
    if (!this.pinSetChecked || this.input.length === 0) {
      return;
    }

    if (this.pinSet) {
      this.postsService.checkPin(this.input).subscribe(res => {
        if (res['success']) {
          this.dialogRef.close(true);
        } else {
          this.dialogRef.close(false);
          this.openSnackBar('Pin is incorrect!');
        }
      });
    } else {
      this.postsService.setPin(this.input).subscribe(res => {
        if (res['success']) {
          this.dialogRef.close(true);
          this.openSnackBar('Pin successfully set!');
        } else {
          this.dialogRef.close(false);
          this.openSnackBar('Failed to set pin!');
        }
      });
    }
  }

  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}

import { Component, OnInit, Inject, EventEmitter } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent implements OnInit {

  dialogTitle = 'Confirm';
  dialogText = 'Would you like to confirm?';
  submitText = 'Yes'
  submitClicked = false;

  doneEmitter: EventEmitter<any> = null;
  onlyEmitOnDone = false;

  warnSubmitColor = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<ConfirmDialogComponent>) {
    if (this.data.dialogTitle) { this.dialogTitle = this.data.dialogTitle };
    if (this.data.dialogText) { this.dialogText = this.data.dialogText };
    if (this.data.submitText) { this.submitText = this.data.submitText };
    if (this.data.warnSubmitColor) { this.warnSubmitColor = this.data.warnSubmitColor };

    // checks if emitter exists, if so don't autoclose as it should be handled by caller
    if (this.data.doneEmitter) {
      this.doneEmitter = this.data.doneEmitter;
      this.onlyEmitOnDone = true;
    }
  }

  confirmClicked() {
    if (this.onlyEmitOnDone) {
      this.doneEmitter.emit(true);
      this.submitClicked = true;
    } else {
      this.dialogRef.close(true);
    }
  }

  ngOnInit(): void {
  }

}

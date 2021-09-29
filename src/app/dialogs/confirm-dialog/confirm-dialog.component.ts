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
  cancelText = null;
  submitClicked = false;
  closeOnSubmit = true;

  doneEmitter: EventEmitter<boolean> = null;
  onlyEmitOnDone = false;

  warnSubmitColor = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<ConfirmDialogComponent>) {
    if (this.data.dialogTitle !== undefined) { this.dialogTitle = this.data.dialogTitle }
    if (this.data.dialogText !== undefined) { this.dialogText = this.data.dialogText }
    if (this.data.submitText !== undefined) { this.submitText = this.data.submitText }
    if (this.data.cancelText !== undefined) { this.cancelText = this.data.cancelText }
    if (this.data.warnSubmitColor !== undefined) { this.warnSubmitColor = this.data.warnSubmitColor }
    if (this.data.warnSubmitColor !== undefined) { this.warnSubmitColor = this.data.warnSubmitColor }
    if (this.data.closeOnSubmit !== undefined) { this.closeOnSubmit = this.data.closeOnSubmit }

    // checks if emitter exists, if so don't autoclose as it should be handled by caller
    if (this.data.doneEmitter) {
      this.doneEmitter = this.data.doneEmitter;
      this.onlyEmitOnDone = true;
    }
  }

  confirmClicked() {
    if (this.onlyEmitOnDone) {
      this.doneEmitter.emit(true);
      if (this.closeOnSubmit) this.submitClicked = true;
    } else {
      if (this.closeOnSubmit) this.dialogRef.close(true);
    }
  }

  ngOnInit(): void {
  }

}

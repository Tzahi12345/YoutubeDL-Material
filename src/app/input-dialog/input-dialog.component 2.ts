import { Component, OnInit, Input, Inject, EventEmitter } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-input-dialog',
  templateUrl: './input-dialog.component.html',
  styleUrls: ['./input-dialog.component.css']
})
export class InputDialogComponent implements OnInit {

  inputTitle: string;
  inputPlaceholder: string;
  submitText: string;

  inputText = '';

  inputSubmitted = false;

  doneEmitter: EventEmitter<any> = null;
  onlyEmitOnDone = false;

  constructor(public dialogRef: MatDialogRef<InputDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit() {
    this.inputTitle = this.data.inputTitle;
    this.inputPlaceholder = this.data.inputPlaceholder;
    this.submitText = this.data.submitText;

    // checks if emitter exists, if so don't autoclose as it should be handled by caller
    if (this.data.doneEmitter) {
      this.doneEmitter = this.data.doneEmitter;
      this.onlyEmitOnDone = true;
    }
  }

  enterPressed() {
    // validates input -- TODO: add custom validator
    if (this.inputText) {
      // only emit if emitter is passed
      if (this.onlyEmitOnDone) {
        this.doneEmitter.emit(this.inputText);
        this.inputSubmitted = true;
      } else {
        this.dialogRef.close(this.inputText);
      }
    }
  }

}

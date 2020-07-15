import { Component, OnInit, Inject, Pipe, PipeTransform, NgModule } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { FormControl } from '@angular/forms';
import { args, args_info } from './youtubedl_args';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators/map';
import { startWith } from 'rxjs/operators/startWith';

@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  transform(text: string, search): string {
    const pattern = search ? search
      .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')
      .split(' ')
      .filter(t => t.length > 0)
      .join('|') : undefined;
    const regex = new RegExp(pattern, 'gi');

    return search ? text.replace(regex, match => `<b>${match}</b>`) : text;
  }
};

@Component({
  selector: 'app-arg-modifier-dialog',
  templateUrl: './arg-modifier-dialog.component.html',
  providers: [HighlightPipe],
  styleUrls: ['./arg-modifier-dialog.component.scss'],
})
export class ArgModifierDialogComponent implements OnInit {
  myGroup = new FormControl();
  firstArg = '';
  secondArg = '';
  secondArgEnabled = false;
  modified_args = '';
  stateCtrl = new FormControl();
  availableArgs = null;
  argsByCategory = null;
  argsInfo = null;
  filteredOptions: Observable<any>;

  static forRoot() {
    return {
        ngModule: ArgModifierDialogComponent,
        providers: [],
    };
 }

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<ArgModifierDialogComponent>,
    private dialog: MatDialog) { }

  ngOnInit(): void {
    if (this.data) {
      this.modified_args = this.data.initial_args;
    }

    this.getAllPossibleArgs();

    // autocomplete setup
    this.filteredOptions = this.stateCtrl.valueChanges
      .pipe(
        startWith(''),
        map(val => this.filter(val))
      );
  }

  // autocomplete filter
  filter(val) {
    if (this.availableArgs) {
      return this.availableArgs.filter(option =>
      option.key.toLowerCase().includes(val.toLowerCase()));
   }
  }

  addArg() {
    // adds space
    if (this.modified_args !== '') {
      this.modified_args += ' ';
    }

    this.modified_args += this.stateCtrl.value + ' ' + (this.secondArgEnabled ? this.secondArg : '');
  }

  canAddArg() {
    return this.stateCtrl.value && this.stateCtrl.value !== '' && (!this.secondArgEnabled || (this.secondArg && this.secondArg !== ''));
  }

  getFirstArg() {
    return new Promise(resolve => {
      resolve(this.stateCtrl.value);
    });
  }

  getValueAsync(val) {
    return new Promise(resolve => {
      resolve(val);
    });
  }

  getAllPossibleArgs() {
    const all_args = args;
    const arg_arrays = Object.keys(all_args).map(function(key) {
      return all_args[key];
    });

    // converts array of arrays to one array
    const singular_arg_array = [].concat.apply([], arg_arrays);

    this.availableArgs = singular_arg_array;
    this.argsByCategory = all_args;
    this.argsInfo = args_info;
  }

  setFirstArg(arg_key) {
    this.stateCtrl.setValue(arg_key);
  }

}

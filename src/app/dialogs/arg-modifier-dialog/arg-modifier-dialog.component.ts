import { Component, OnInit, Inject, Pipe, PipeTransform, ViewChild, AfterViewInit } from '@angular/core';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormControl } from '@angular/forms';
import { args, args_info } from './youtubedl_args';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators/map';
import { startWith } from 'rxjs/operators/startWith';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';

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
export class ArgModifierDialogComponent implements OnInit, AfterViewInit {
  myGroup = new FormControl();
  firstArg = '';
  secondArg = '';
  secondArgEnabled = false;
  modified_args = '';
  stateCtrl = new FormControl();
  chipCtrl = new FormControl();
  availableArgs = null;
  argsByCategory = null;
  argsByKey = null;
  argsInfo = null;
  filteredOptions: Observable<any>;
  filteredChipOptions: Observable<any>;

  // chip list
  chipInput = '';
  visible = true;
  selectable = true;
  removable = true;
  addOnBlur = false;
  args_array = null;
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];

  @ViewChild( 'chipper', {read: MatAutocompleteTrigger})  autoTrigger: MatAutocompleteTrigger;

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
      this.generateArgsArray();
    }

    this.getAllPossibleArgs();

    // autocomplete setup
    this.filteredOptions = this.stateCtrl.valueChanges
      .pipe(
        startWith(''),
        map(val => this.filter(val))
      );

    this.filteredChipOptions = this.chipCtrl.valueChanges
      .pipe(
        startWith(''),
        map(val => this.filter(val))
      );
  }

  ngAfterViewInit() {
    this.autoTrigger.panelClosingActions.subscribe( x => {
      if (this.autoTrigger.activeOption) {
        console.log(this.autoTrigger.activeOption.value)
        this.chipCtrl.setValue(this.autoTrigger.activeOption.value)
      }
    } )
  }

  // autocomplete filter
  filter(val) {
    if (this.availableArgs) {
      return this.availableArgs.filter(option =>
      option.key.toLowerCase().includes(val.toLowerCase()));
   }
  }

  addArg() {
    if (!this.modified_args) {
      this.modified_args = '';
    }
    // adds space
    if (this.modified_args !== '') {
      this.modified_args += ',,';
    }

    this.modified_args += this.stateCtrl.value + (this.secondArgEnabled ? ',,' + this.secondArg : '');
    this.generateArgsArray();
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
    const args_by_key = singular_arg_array.reduce((acc, curr) => {
      acc[curr.key] = curr;
      return acc;
    }, {});
    this.argsByKey = args_by_key;

    this.availableArgs = singular_arg_array;
    this.argsByCategory = all_args;
    this.argsInfo = args_info;
  }

  setFirstArg(arg_key) {
    this.stateCtrl.setValue(arg_key);
  }

  // chip list functions

  add(event) {
    const input = event.input;
    const arg = event.value;

    if (!arg || arg.trim().length === 0) {
      return;
    }

    this.args_array.push(arg);
    if (this.modified_args.length > 0) {
      this.modified_args += ',,'
    }
    this.modified_args += arg;
    if (input) { input.value = ''; }
  }

  remove(arg_index) {
    this.args_array.splice(arg_index, 1);
    this.modified_args = this.args_array.join(',,');
  }

  generateArgsArray() {
    if (this.modified_args.trim().length === 0) {
      this.args_array = [];
      return;
    }
    this.args_array = this.modified_args.split(',,');
  }

  drop(event: CdkDragDrop<any>) {
    moveItemInArray(this.args_array, event.previousIndex, event.currentIndex);
    this.modified_args = this.args_array.join(',,');
  }

}

import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { MatSnackBar } from '@angular/material';
import { Router } from '@angular/router';

@Component({
  selector: 'app-subscription-file-card',
  templateUrl: './subscription-file-card.component.html',
  styleUrls: ['./subscription-file-card.component.scss']
})
export class SubscriptionFileCardComponent implements OnInit {
  image_errored = false;
  image_loaded = false;

  scrollSubject;
  scrollAndLoad;

  @Input() file;

  @Output() goToFileEmit = new EventEmitter<any>();

  constructor(private snackBar: MatSnackBar) {
    this.scrollSubject = new Subject();
    this.scrollAndLoad = Observable.merge(
      Observable.fromEvent(window, 'scroll'),
      this.scrollSubject
    );
  }

  ngOnInit() {

  }

  onImgError(event) {
    this.image_errored = true;
  }

  onHoverResponse() {
    this.scrollSubject.next();
  }

  imageLoaded(loaded) {
    this.image_loaded = true;
  }

  goToFile() {
    this.goToFileEmit.emit(this.file.title);
  }

  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}

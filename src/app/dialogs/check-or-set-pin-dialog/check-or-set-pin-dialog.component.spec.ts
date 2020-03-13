import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckOrSetPinDialogComponent } from './check-or-set-pin-dialog.component';

describe('CheckOrSetPinDialogComponent', () => {
  let component: CheckOrSetPinDialogComponent;
  let fixture: ComponentFixture<CheckOrSetPinDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CheckOrSetPinDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CheckOrSetPinDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

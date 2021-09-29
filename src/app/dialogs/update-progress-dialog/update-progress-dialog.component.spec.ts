import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { UpdateProgressDialogComponent } from './update-progress-dialog.component';

describe('UpdateProgressDialogComponent', () => {
  let component: UpdateProgressDialogComponent;
  let fixture: ComponentFixture<UpdateProgressDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ UpdateProgressDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(UpdateProgressDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

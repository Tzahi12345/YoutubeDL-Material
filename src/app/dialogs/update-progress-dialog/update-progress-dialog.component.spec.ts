import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateProgressDialogComponent } from './update-progress-dialog.component';

describe('UpdateProgressDialogComponent', () => {
  let component: UpdateProgressDialogComponent;
  let fixture: ComponentFixture<UpdateProgressDialogComponent>;

  beforeEach(async(() => {
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

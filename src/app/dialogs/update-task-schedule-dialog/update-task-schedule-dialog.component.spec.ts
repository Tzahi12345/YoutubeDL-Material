import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateTaskScheduleDialogComponent } from './update-task-schedule-dialog.component';

describe('UpdateTaskScheduleDialogComponent', () => {
  let component: UpdateTaskScheduleDialogComponent;
  let fixture: ComponentFixture<UpdateTaskScheduleDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ UpdateTaskScheduleDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UpdateTaskScheduleDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

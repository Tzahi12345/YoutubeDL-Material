import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SetDefaultAdminDialogComponent } from './set-default-admin-dialog.component';

describe('SetDefaultAdminDialogComponent', () => {
  let component: SetDefaultAdminDialogComponent;
  let fixture: ComponentFixture<SetDefaultAdminDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SetDefaultAdminDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SetDefaultAdminDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

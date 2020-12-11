import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ArgModifierDialogComponent } from './arg-modifier-dialog.component';

describe('ArgModifierDialogComponent', () => {
  let component: ArgModifierDialogComponent;
  let fixture: ComponentFixture<ArgModifierDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ArgModifierDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ArgModifierDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

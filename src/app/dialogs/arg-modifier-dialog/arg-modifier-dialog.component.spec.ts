import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ArgModifierDialogComponent } from './arg-modifier-dialog.component';

describe('ArgModifierDialogComponent', () => {
  let component: ArgModifierDialogComponent;
  let fixture: ComponentFixture<ArgModifierDialogComponent>;

  beforeEach(async(() => {
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

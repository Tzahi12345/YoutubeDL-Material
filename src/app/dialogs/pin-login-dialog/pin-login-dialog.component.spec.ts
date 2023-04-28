import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PinLoginComponent } from './pin-login-dialog.component';

describe('PinLoginComponent', () => {
  let component: PinLoginComponent;
  let fixture: ComponentFixture<PinLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PinLoginComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PinLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

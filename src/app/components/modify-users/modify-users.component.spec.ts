import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ModifyUsersComponent } from './modify-users.component';

describe('ModifyUsersComponent', () => {
  let component: ModifyUsersComponent;
  let fixture: ComponentFixture<ModifyUsersComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ModifyUsersComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ModifyUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

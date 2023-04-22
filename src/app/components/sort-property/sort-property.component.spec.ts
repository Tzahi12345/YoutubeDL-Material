import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SortPropertyComponent } from './sort-property.component';

describe('SortPropertyComponent', () => {
  let component: SortPropertyComponent;
  let fixture: ComponentFixture<SortPropertyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SortPropertyComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SortPropertyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

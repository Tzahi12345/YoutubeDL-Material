import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkifyPipe, SeeMoreComponent } from './see-more.component';

describe('SeeMoreComponent', () => {
  let component: SeeMoreComponent;
  let fixture: ComponentFixture<SeeMoreComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SeeMoreComponent, LinkifyPipe ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SeeMoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

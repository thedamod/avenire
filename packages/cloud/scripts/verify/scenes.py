import manimgx as m
import numpy as np
class Plot(m.Scene):
    def construct(self):
        self.camera.background_color = '#181818'
        axes=m.Axes(x_range=[-3,3,1],y_range=[-1.5,1.5,1],x_length=8,y_length=3,axis_config={'color':'#999999','stroke_width':1})
        axes.shift(m.DOWN*.7)
        curve=axes.plot(lambda x:np.sin(x),color='#a5a2e9',stroke_width=2)
        equation=m.MathTex(r'f(x)=\sin(x)',color='#e4e4e4').to_edge(m.UP)
        self.play(m.Create(axes),m.Write(equation),run_time=.7)
        self.play(m.Create(curve),run_time=1)
        self.wait(.3)
class Spatial(m.ThreeDScene):
    def construct(self):
        self.camera.background_color='#181818'
        self.set_camera_orientation(phi=65*m.DEGREES,theta=-45*m.DEGREES)
        cube=m.Cube(side_length=2,fill_color='#a5a2e9',fill_opacity=.7,stroke_width=1)
        self.add(cube)
        self.begin_ambient_camera_rotation(rate=.6)
        self.wait(2)
        self.stop_ambient_camera_rotation()

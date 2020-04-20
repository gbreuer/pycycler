# Takes csv input with columns
# and returns bimodal histogram analysis
# Author - Greg Breuer - gregory.breuer@yale.edu
# v0.11 - Fixed to auto-scale to mean value of 50 to make sure curve_fitting parameters are optimized appropriately

#TODO: Delete matplotlib
import numpy as np
from numpy import mean, size, zeros, where, transpose
from scipy import linspace, signal, arange
from scipy.optimize import curve_fit
from scipy.integrate import quad
from scipy.stats import norm
from math import sqrt,pi,ceil,floor
from sklearn.neighbors import KernelDensity
from matplotlib.pyplot import hist, savefig
import matplotlib.pyplot as plt

def normal_curve(x,a,b,c):
	return a*norm.pdf(x,b,c)
#	return a*np.exp((-(x-b)**2)/(2*(c**2)))

def quadratic(x,a,b,c,d):
	return a*(x-d)**2 + b*(x-d) + c

def linear(x,a,b,c,d):
	return b*(x-d) + c

def sigmoidal(x,a,b,c,d):
	return a/(1+np.exp(c*x+b))+d

def both_curves(x,a1,a2,b,c1,c2):
	return a1*np.exp((-(x-b)**2)/(2*(c1**2))) + a2*np.exp((-(x-2*b)**2)/(2*(c2**2)))

def s_phase(x,g1_peak,c,quad_a,quad_b,quad_c,quad_d):
	offset = max(0.01,2*c)
	x_vals = np.zeros(len(x))

	g1_start = min(g1_peak+offset,g1_peak*1.4)
	g2_start = max(1.6*g1_peak,2*g1_peak-offset)
	#num_peaks = min(max(10,int((g2_start-g1_start)/offset)),50)
	num_peaks = 50

	#plot gaussian distributions on quadtratic slope
	for i in np.linspace(g1_start,g2_start,num_peaks):
		tmp_results = normal_curve(x, quadratic(x,quad_a,quad_b,quad_c,quad_d),i,c)
		tmp_results[np.where(tmp_results < 0)] = 0
		x_vals = np.add(x_vals,tmp_results)

	return x_vals

def all_curves(x,a1,a2,b,c,quad_a,quad_b,quad_c,quad_d):
    return normal_curve(x,a1,b,c)+s_phase(x,b,c,quad_a,quad_b,quad_c,quad_d)+normal_curve(x,a2,2*b,c)

def refined_analysis(data, x_min, x_max, g1_guess, g2_guess, stdev=-1, target_range=100., output_filename=None):
	raw_values = data

	lock_stdev = (stdev != -1)

	#count sub_g1 and sup_g2 values
	raw_values = np.array(raw_values).astype(float)
	total_events = len(raw_values)
	sub_g1_count = len(np.where(raw_values<x_min)[0])
	sup_g2_count = len(np.where(raw_values>x_max)[0])
	filt_values = raw_values[raw_values>x_min]
	filt_values = filt_values[filt_values<x_max]

	#select random 5000 values to keep calculation time lower
	filt_values = np.random.choice(filt_values,5000)

	#TODO: check math
	high = np.max(filt_values)
	filt_values *= target_range/high
	raw_values *= target_range/high
	x_min = (x_min)*(target_range/high)
	x_max = (x_max )*(target_range/high)
	g1_guess = (g1_guess)*(target_range/high)
	g2_guess = (g2_guess)*(target_range/high)
	stdev = (stdev)*(target_range/high)

	if output_filename:
		fig, ax = plt.subplots(1, 1, sharex=True, sharey=True)
		fig.subplots_adjust(hspace=0.05, wspace=0.05)

	#Calculate and plot Kernel Density
	#kd = KernelDensity(bandwidth=0.02*target_range)
	kd = KernelDensity(bandwidth=0.005*target_range)
	kd.fit(filt_values[:, None])
	x_vals = linspace(min(filt_values), max(filt_values), int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)
	if output_filename:
		ax.plot(x_vals,dens)

	#Calculate G1
	g1_peak_value = np.exp(kd.score_samples([[g1_guess]])[0])
	g2_peak_value = np.exp(kd.score_samples([[g2_guess]])[0])

	if not lock_stdev:
		stdev = 0.05*g1_guess

	start_guess = [g1_peak_value, g2_peak_value, g1_guess, stdev, 0, 0, 0.05, 1.5*g1_guess]
	#x_vals = linspace(g1_guess*0.9, g1_guess*1.1, int(len(filt_values)))[:,None]
	x_vals = linspace(g1_guess*0.75, 2*g1_guess*1.25, int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)

	x_range = x_vals[:,0]
	y_range = dens

	if lock_stdev:
		#g1_opt, cov = curve_fit(all_curves, x_range, y_range, start_guess, bounds=([0,0,g1_guess*0.95,stdev*0.95,-0.1,-50,0,g1_guess],[1,1,g1_guess*1.05,stdev*1.05,0.1,50,1,2*g1_guess]), maxfev=5000)
		g1_opt, cov = curve_fit(all_curves, x_range, y_range, start_guess, bounds=([0,0,g1_guess*0.95,stdev*0.95,-np.inf,-np.inf,-np.inf,-np.inf],[1,1,g1_guess*1.05,stdev*1.05,np.inf,np.inf,np.inf,np.inf]), maxfev=250)

	else:
		g1_opt, cov = curve_fit(all_curves, x_range, y_range, start_guess, bounds=([0,0,g1_guess*0.95,0.001*target_range,-0.1,-50,0,g1_guess],[1,1,g1_guess*1.05,0.1*g1_guess,0.1,50,1,2*g1_guess]), maxfev=250)

	#TODO: adjust number of points taken here
	x_vals = linspace(min(filt_values), max(filt_values), 500)[:,None]
	#Integrate to get areas: integrate KDE to normalize, then G1 and G2 to subtract
	start_x = min(x_vals)
	end_x = max(x_vals)

	#TODO: see what root problem is
	KDE_area = quad(lambda x: np.exp(kd.score_samples([[x]])), start_x, end_x)
	g1_area = quad(normal_curve, start_x, end_x, args=(g1_opt[0],g1_opt[2],g1_opt[3]))
	g2_area = quad(normal_curve, start_x, end_x, args=(g1_opt[1],g1_opt[2],g1_opt[3]))
	#s_area = quad(s_phase, start_x, end_x, args=(g1_opt[2], g1_opt[3],g1_opt[4],g1_opt[5],g1_opt[6]))

	g1_pct = g1_area[0]/KDE_area[0]
	g2_pct = g2_area[0]/KDE_area[0]
	s_pct = 1-(g1_area[0] + g2_area[0])/KDE_area[0]

	#Display graph
	if output_filename:
		ax.fill(x_vals[:, 0], np.exp(kd.score_samples(x_vals)), fc='#AAAAFF')
		#ax.fill(x_vals, dens, fc='#123B67')
		x_vals = linspace(min(filt_values), max(filt_values), 1000)
		ax.hist(raw_values,int(sqrt(len(raw_values))),density=True,color='#002D5C')
		ax.plot(x_vals, normal_curve(x_vals, g1_opt[1], 2*g1_opt[2], g1_opt[3]),color='red')
		ax.fill(x_vals, normal_curve(x_vals, g1_opt[1], 2*g1_opt[2], g1_opt[3]),fc='red',alpha=0.7)
		ax.plot(x_vals, s_phase(x_vals, g1_opt[2], g1_opt[3],g1_opt[4],g1_opt[5],g1_opt[6],g1_opt[7]),color='green')
		ax.fill(x_vals, s_phase(x_vals, g1_opt[2], g1_opt[3],g1_opt[4],g1_opt[5],g1_opt[6],g1_opt[7]),fc='green',alpha=0.7)
		ax.plot(x_vals, normal_curve(x_vals, g1_opt[0], g1_opt[2], g1_opt[3]),color='yellow')
		ax.fill(np.insert(x_vals,0,[0]), np.insert(normal_curve(x_vals, g1_opt[0], g1_opt[2], g1_opt[3]),0,[0]),fc='yellow', alpha=0.7)

		f = output_filename
		savefig(f,bbox_inches='tight')
		plt.close('all')

	#Readjust for scaling
	#g1_max_val = len(filt_values)*g1_opt[0]
	g1_max_val = len(filt_values)*g1_opt[0]
	g1_peak = g1_opt[2]/(target_range/high)
	g1_opt_std = g1_opt[3]/(target_range/high)
	#g2_max_val = len(filt_values)*g1_opt[0]
	g2_max_val = len(filt_values)*g1_opt[1]
	g2_peak = 2*g1_opt[2]/(target_range/high)

	x_vals = linspace(min(filt_values), max(filt_values), 500)
	return_dict = {}
	return_dict['g1_pct'] = g1_pct
	return_dict['g2_pct'] = g2_pct
	return_dict['s_pct'] = s_pct
	return_dict['fig'] = None
	return_dict['low_count'] = sub_g1_count
	return_dict['high_count'] = sup_g2_count
	return_dict['total_count'] = total_events
	return_dict['fit_data'] = [x_vals.tolist(), normal_curve(x_vals, g1_opt[1], 2*g1_opt[2], g1_opt[3]).tolist(), normal_curve(x_vals, g1_opt[0], g1_opt[2], g1_opt[3]).tolist(), s_phase(x_vals, g1_opt[2], g1_opt[3],g1_opt[4],g1_opt[5],g1_opt[6],g1_opt[7]).tolist()]
	return_dict['g1_opt'] = [g1_max_val, g1_peak, g1_opt_std]
	return_dict['g2_opt'] = [g2_max_val, g2_peak, g1_opt_std]

	return return_dict

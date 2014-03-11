  Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType: 'release',
    comboboxConfig: {
        fieldLabel: 'Select a Release:',
        labelWidth: 100,
        width: 300
    },
   
  
    onScopeChange: function() {
      if (this.down('#myChart')) {
	      this.down('#myChart').destroy();
      }
      
      Ext.create('Rally.data.WsapiDataStore', {
	model: 'TestSet',
	fetch: ['ObjectID','FormattedID','Name','TestCases','TestCaseStatus','Iteration'],  
	limit: Infinity,
	autoLoad: true,
	filters: [this.getContext().getTimeboxScope().getQueryFilter()],
	listeners: {
	    load: this._onTestSetsLoaded,
	    scope: this
	}
    });
    },
    
    _onTestSetsLoaded:function(store, records){
	var setsWithCases = [];
        //var testsets = [];
        var that = this;
        var promises = [];
	_.each(records, function(testset){
            promises.push(that._getTestCases(testset, that));
        });
	Deft.Promise.all(promises).then({
	  success: function(testsets){
	    _.each(testsets, function(testset){
	      if (testset.TestCases.length > 0) {
                        setsWithCases.push(testset);
                    }
	    })
	    that._makeGrid(setsWithCases);
	  }
	})
     },
     
    _getTestCases:function(testset, scope){
      var testcases = [];
      var ts = {};
      
      var deferred = Ext.create('Deft.Deferred');
      var that = scope;
      
      var testCaseCollection = testset.getCollection('TestCases',{fetch: ['Name', 'FormattedID', 'TestCaseResults']});
      var iteration = testset.get('Iteration');
      testCaseCollection.load({
	callback: function(records, operation, success){
	  _.each(records, function(testcase){
	    testcases.push(testcase);
	  });
	  ts = {
	    "_ref": testset.get('_ref'),
            "ObjectID": testset.get('ObjectID'),
            "FormattedID": testset.get('FormattedID'),
            "Name": testset.get('Name'),
	    "Iteration" : (iteration && iteration._refObjectName)|| 'None',
            "TestCases": testcases
	  };
	  deferred.resolve(ts);
	}
      });
      return deferred;
    },
    
    _makeGrid:function(setsWithCases){
      console.log('setsWithCases',setsWithCases);
      console.log('setsWithCases count',setsWithCases.length);
      
      var that = this;
      that._count = setsWithCases.length;
      if(that.down('#testsetGrid')){
	that.down('#testsetGrid').destroy();
      }
      var gridStore = Ext.create('Rally.data.custom.Store', {
	  data: setsWithCases,
	  limit:Infinity,
	  remoteSort: false
      });
      that.add({
	xtype: 'rallygrid',
	itemId: 'testsetGrid',
	store: gridStore,
	columnCfgs:[
	    {
	      text: 'Formatted ID', dataIndex: 'FormattedID', xtype: 'templatecolumn',
		tpl: Ext.create('Rally.ui.renderer.template.FormattedIDTemplate') 
	    },
	    {
	      text: 'Name', dataIndex: 'Name', flex: 1
	    },
	    {
		text: 'TestCases', dataIndex: 'TestCases', flex:1,
		renderer: function(value) {
		    var html = [];
		    _.each(value, function(testcase){
			html.push('<a href="' + Rally.nav.Manager.getDetailUrl(testcase) + '">' + testcase.get('FormattedID') + '</a>');
		    });
		    return html.join(', ');
		}
	    },
	    {
	      text: 'Iteration', dataIndex: 'Iteration'
	    },
	    {
	      text: 'Test Case Results',
	      renderer: function (value, model, record) {
		  console.log('record', record)
		  var id = Ext.id();
		  Ext.defer(function () {
		      //Ext.widget('button', {
		      Ext.create('Rally.ui.Button',{
			  renderTo: id,
			  text: 'TCR of ' + record.data.FormattedID,
			  height: 15,
			  handler: function () {
			      that._seeResults(record.data);
			  }
		      });
		  },60);
		    return Ext.String.format('<div id="{0}"></div>', id);
	      }
            }  
	]
      });
    },
    
    _seeResults: function(testSetRecord) {
      var testset = testSetRecord._ref;
      this._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait.This may take long if you have thousands of results..."});
      this._myMask.show();
      this._myStore = Ext.create('Rally.data.WsapiDataStore', {
	model: 'Test Case Result',
	limit: Infinity,
	fetch: ['Verdict','TestCase','Build'],
	filters:[
	 {
	   property: 'TestSet',
	   value: testset
	 }
	],
	autoLoad: true,
	listeners: {
	   load: this._onDataLoaded,
	   scope: this
	 }
      });
    },
     _onDataLoaded: function(store, data) {
          if (this.down('#myChart')) {
	      this.down('#myChart').destroy();
	  }
          this._myMask.hide();
	  var records = [];
	  var verdictsGroups = ["Pass","Blocked","Error","Fail","Inconclusive"]

	  var passCount = 0;
	  var blockedCount = 0;
	  var errorCount = 0;
	  var failCount = 0;
	  var inconclusiveCount = 0;
	  
	  var getColor = {
	      'Pass': '#009900',
	      'Blocked': '#FF8000',
	      'Error': '#990000', 
	      'Fail': '#FF0000', 
	      'Inconclusive': '#A0A0A0'
	  };

	  _.each(data, function(record) {
	      verdict = record.get('Verdict');
	      switch(verdict)
	      {
		  case "Pass":
		     passCount++;
		      break;
		  case "Blocked":
		      blockedCount++;
		      break;
		  case "Error":
		      errorCount++;
		      break;
		  case "Fail":
		      failCount++;
		      break;
		  case "Inconclusive":
		      inconclusiveCount++;
	      }
	  });

	  this.add(
	      {
			xtype: 'rallychart',
			height: 400,
			storeType: 'Rally.data.WsapiDataStore',
			store: this._myStore,
			itemId: 'myChart',
			chartConfig: {
			    chart: {
				type: 'pie'
			    },
			    title: {
				text: 'TestCaseResults Verdict Counts',
				align: 'center'
			    },
			    tooltip: {
				formatter: function () {
				   return this.point.name + ': <b>' + Highcharts.numberFormat(this.percentage, 1) + '%</b><br />' + this.point.y;
				    }
			    },
			    plotOptions : {
				 pie: {
				    allowPointSelect: true,
				    cursor: 'pointer',
				    point: {
					events: {
					    click: function(event) {
						var options = this.options;
						alert(options.name + ' clicked');
					    }
					}
				    },
				    dataLabels: {
					enabled: true,
					color: '#000000',
					connectorColor: '#000000'
				    }
				}
			    }
			},            
			chartData: {
			    series: [ 
				{   
				    name: 'Verdicts',
				    data: [
					{name: 'Pass',
					y: passCount,
					color: getColor['Pass']
					},
					{name: 'Blocked',
					y: blockedCount,
					color: getColor['Blocked']
					},
					{name: 'Fail',
					y: failCount,
					color: getColor['Fail']
					},
					{name: 'Error',
					 y: errorCount,
					color: getColor['Error']
					},
					{name: 'Inconclusive',
					 y: inconclusiveCount,
					color: getColor['Inconclusive']
					}
					  ]
				}
			    ]
			}
	    }
	);
	this.down('#myChart')._unmask();
    }   
 });
